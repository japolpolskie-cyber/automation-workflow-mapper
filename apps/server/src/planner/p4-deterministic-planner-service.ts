import {
  p36BusinessIntentOutputSchema,
  type CanonicalWorkflow,
  type DetectedProcessSummary,
  type P3BusinessIntentOutput,
  type Platform,
  type PlannerRetrievalContext,
  type StageCGroundingReport,
  type StageDGroundingReport,
  type StructuredWorkflowPlan,
} from '@awm/shared';
import { PlannerContextBuilder } from './planner-context-builder.js';
import { buildP36IntentInput, resolveP36Intent } from './controlled-vocabulary.js';
import { DeterministicSkeletonCompiler, type SkeletonCompilationResult } from './deterministic-skeleton-compiler.js';
import { validateP3Intent, type P3ValidationIssue } from '../distributed-planner/p3-stage-validator.js';
import type { P3StageMetrics, PlannerStageRunnerFactory } from '../distributed-planner/p3-ollama-stage-runner.js';
import type { StageCGroundingService } from './stage-c-grounding-service.js';
import type { StageDGroundingService } from './stage-d-grounding-service.js';

export interface P4PlannerResult {
  status: 'completed' | 'blocked' | 'failed' | 'cancelled';
  intent: P3BusinessIntentOutput | null;
  plan: StructuredWorkflowPlan | null;
  intentValidation: P3ValidationIssue[];
  compilerIssues: P3ValidationIssue[];
  appliedPatterns: string[];
  metrics: { stageA: P3StageMetrics[]; compilerLatencyMs: number; totalLatencyMs: number; retryCount: number };
  productionWorkflowUnchanged: boolean;
  persisted: false;
  error: string | null;
  grounding: StageCGroundingReport | null;
  edgeGrounding: StageDGroundingReport | null;
}

export class P4DeterministicPlannerService {
  public constructor(
    private readonly runnerFactory: PlannerStageRunnerFactory,
    private readonly compiler = new DeterministicSkeletonCompiler(),
    private readonly contextBuilder = new PlannerContextBuilder(),
    private readonly groundingService: StageCGroundingService | null = null,
    private readonly edgeGroundingService: StageDGroundingService | null = null,
  ) {}

  public async run(objective: string, platform: Platform, analysis: DetectedProcessSummary, productionWorkflow: CanonicalWorkflow, signal?: AbortSignal, retrievalContext?: PlannerRetrievalContext): Promise<P4PlannerResult> {
    const started = performance.now();
    const productionSnapshot = JSON.stringify(productionWorkflow);
    const context = this.contextBuilder.build(objective, platform, analysis, retrievalContext);
    const { input, table } = buildP36IntentInput('p4-shadow', objective, context, analysis.knowledgeContext.catalogVersion);
    const runner = this.runnerFactory.create('business-intent', p36BusinessIntentOutputSchema, 60_000);
    let intent: P3BusinessIntentOutput | null = null;
    let intentValidation: P3ValidationIssue[] = [];
    let error: string | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (signal?.aborted) return this.result('cancelled', null, null, [], [], [], runner.metrics ?? [], 0, performance.now() - started, retryCount, productionSnapshot, productionWorkflow, 'Planning was cancelled.', null, null);
      try {
        const output = await runner.run(input, {
          signal: signal ?? new AbortController().signal,
          attempt,
          stageInstanceId: 'stage-a-intent',
          runId: 'p4-shadow',
          previousValidationIssues: intentValidation.map((item) => `${item.code}: ${item.message}`),
        });
        const wire = p36BusinessIntentOutputSchema.parse(output);
        intent = resolveP36Intent(input, wire, table);
        intentValidation = validateP3Intent({
          contractVersion: '3.0.0', runId: 'p4-shadow', rawScope: objective, platform,
          facts: context.facts, clarifications: context.clarifications, patterns: context.patterns, evidence: context.evidence,
        }, intent);
        if (!intentValidation.length) break;
        error = intentValidation.map((item) => `${item.code}: ${item.message}`).join('; ');
      } catch (cause) {
        error = cause instanceof Error ? cause.message : 'Stage A returned an invalid business-intent artifact.';
        intentValidation = [{ code: 'P4_STAGE_A_INVALID', message: error }];
      }
      retryCount += 1;
    }

    if (!intent || intentValidation.length) {
      return this.result('failed', intent, null, intentValidation, [], [], runner.metrics ?? [], 0, performance.now() - started, retryCount, productionSnapshot, productionWorkflow, error ?? 'Stage A did not complete safely.', null, null);
    }

    const compiled: SkeletonCompilationResult = this.compiler.compile(context, intent);
    const compilerIssues = compiled.issues.map((item) => ({ code: item.code, message: item.message }));
    const grounding = !compilerIssues.length && this.groundingService ? await this.groundingService.ground(compiled.plan, context, signal) : null;
    const groundingFailed = grounding?.status === 'failed' || grounding?.status === 'cancelled';
    const edgeGrounding = !compilerIssues.length && grounding && !groundingFailed && this.edgeGroundingService
      ? await this.edgeGroundingService.ground(compiled.plan, grounding.nodes, context, signal)
      : null;
    const edgeGroundingFailed = edgeGrounding?.status === 'failed' || edgeGrounding?.status === 'cancelled';
    const status = compilerIssues.length || groundingFailed || edgeGroundingFailed ? 'failed' : context.clarifications.length ? 'blocked' : 'completed';
    return this.result(status, intent, compiled.plan, intentValidation, compilerIssues, compiled.appliedPatterns, runner.metrics ?? [], compiled.durationMs, performance.now() - started, retryCount, productionSnapshot, productionWorkflow, compilerIssues.length ? compilerIssues.map((item) => `${item.code}: ${item.message}`).join('; ') : groundingFailed ? 'Stage C grounding did not complete safely.' : edgeGroundingFailed ? 'Stage D grounding did not complete safely.' : null, grounding, edgeGrounding);
  }

  private result(
    status: P4PlannerResult['status'], intent: P3BusinessIntentOutput | null, plan: StructuredWorkflowPlan | null,
    intentValidation: P3ValidationIssue[], compilerIssues: P3ValidationIssue[], appliedPatterns: string[],
    stageA: P3StageMetrics[], compilerLatencyMs: number, totalLatencyMs: number, retryCount: number,
    productionSnapshot: string, productionWorkflow: CanonicalWorkflow, error: string | null, grounding: StageCGroundingReport | null, edgeGrounding: StageDGroundingReport | null,
  ): P4PlannerResult {
    return {
      status, intent, plan, intentValidation, compilerIssues, appliedPatterns,
      metrics: { stageA, compilerLatencyMs, totalLatencyMs: Number(totalLatencyMs.toFixed(2)), retryCount },
      productionWorkflowUnchanged: JSON.stringify(productionWorkflow) === productionSnapshot,
      persisted: false, error, grounding, edgeGrounding,
    };
  }
}
