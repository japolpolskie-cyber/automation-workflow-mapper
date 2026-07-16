import {
  distributedPlannerContractVersion, p36BusinessIntentInputSchema, p36BusinessIntentOutputSchema, p36ContractVersion, p37SkeletonContractVersion,
  p36WorkflowSkeletonInputSchema, p36WorkflowSkeletonOutputSchema, type CanonicalWorkflow, type DetectedProcessSummary,
  type DistributedPlannerRunReport, type P3BusinessIntentOutput, type P3WorkflowSkeletonOutput,
  type Platform,
} from '@awm/shared';
import { PlannerContextBuilder } from '../planner/planner-context-builder.js';
import { buildP36IntentInput, buildP36SkeletonInput, resolveP36Intent, resolveP36Skeleton } from '../planner/controlled-vocabulary.js';
import { DistributedPlannerOrchestrator, DistributedStageError, type DistributedStageDefinition, type ModelNeutralStageRunner } from './distributed-planner-orchestrator.js';
import { contentHash, InMemoryStageCache } from './stage-cache.js';
import { validateP3Intent, validateP3Skeleton, type P3ValidationIssue } from './p3-stage-validator.js';
import { validateP37SemanticSkeleton } from './p3-semantic-validator.js';
import type { P3StageMetrics, PlannerStageRunnerFactory } from './p3-ollama-stage-runner.js';

export interface P3RuntimeOptions {
  stageATimeoutMs: number; stageBTimeoutMs: number; totalTimeoutMs: number; maximumRetries: number;
  maximumOutputCharacters: number; cacheEnabled: boolean;
}
export interface P3ExperimentResult {
  status: 'completed' | 'failed' | 'blocked' | 'cancelled';
  intent: P3BusinessIntentOutput | null; skeleton: P3WorkflowSkeletonOutput | null;
  intentValidation: P3ValidationIssue[]; skeletonValidation: P3ValidationIssue[];
  report: DistributedPlannerRunReport; metrics: { stageA: P3StageMetrics[]; stageB: P3StageMetrics[] };
  productionWorkflowUnchanged: boolean; persisted: false;
}

class ValidatingCaptureRunner<TResolved> implements ModelNeutralStageRunner {
  public wireOutput: unknown = null;
  public resolvedOutput: TResolved | null = null;
  public constructor(public readonly runnerId: string, public readonly modelId: string | null, private readonly delegate: ModelNeutralStageRunner, private readonly resolveAndValidate: (value: unknown) => { resolved: TResolved; issues: P3ValidationIssue[] }) {}
  public async run(input: unknown, context: Parameters<ModelNeutralStageRunner['run']>[1]) {
    const output = await this.delegate.run(input, context);
    let resolved: TResolved; let issues: P3ValidationIssue[];
    try { ({ resolved, issues } = this.resolveAndValidate(output)); }
    catch (error) { throw new DistributedStageError('invalid-output', error instanceof Error ? error.message : 'Controlled planner output could not be resolved.', true); }
    if (issues.length) throw new DistributedStageError('invalid-output', issues.map((item) => `${item.code}: ${item.message}`).join('; '), true, { issues });
    this.wireOutput = output; this.resolvedOutput = resolved; return output;
  }
}

export class P3ShadowExperimentService {
  private readonly cache = new InMemoryStageCache();
  public constructor(private readonly options: P3RuntimeOptions, private readonly runnerFactory: PlannerStageRunnerFactory, private readonly contextBuilder = new PlannerContextBuilder()) {}
  public async run(objective: string, platform: Platform, analysis: DetectedProcessSummary, productionWorkflow: CanonicalWorkflow, signal?: AbortSignal): Promise<P3ExperimentResult> {
    const productionSnapshot = JSON.stringify(productionWorkflow); const plannerContext = this.contextBuilder.build(objective, platform, analysis);
    const { input: intentInput, table } = buildP36IntentInput('p3-shadow', objective, plannerContext, analysis.knowledgeContext.catalogVersion);
    const stageADelegate = this.runnerFactory.create('business-intent', p36BusinessIntentOutputSchema, this.options.maximumOutputCharacters);
    let intentIssues: P3ValidationIssue[] = []; let skeletonIssues: P3ValidationIssue[] = [];
    const stageA = new ValidatingCaptureRunner<P3BusinessIntentOutput>('p3.stage-a', stageADelegate.modelId, stageADelegate, (value) => {
      const wire = p36BusinessIntentOutputSchema.parse(value);
      const resolved = resolveP36Intent(intentInput, wire, table);
      const legacyInput = {
        contractVersion: '3.0.0' as const, runId: 'p3-shadow', rawScope: objective, platform,
        facts: plannerContext.facts, clarifications: plannerContext.clarifications, patterns: plannerContext.patterns, evidence: plannerContext.evidence,
      };
      intentIssues = validateP3Intent(legacyInput, resolved);
      return { resolved, issues: intentIssues };
    });
    let stageBInput: unknown;
    const stageBDelegate = this.runnerFactory.create('workflow-skeleton', p36WorkflowSkeletonOutputSchema, this.options.maximumOutputCharacters);
    const stageB = new ValidatingCaptureRunner<P3WorkflowSkeletonOutput>('p3.stage-b', stageBDelegate.modelId, stageBDelegate, (value) => {
      const wire = p36WorkflowSkeletonOutputSchema.parse(value);
      const semanticIssues = validateP37SemanticSkeleton(p36WorkflowSkeletonInputSchema.parse(stageBInput), wire);
      const resolved = resolveP36Skeleton(p36WorkflowSkeletonInputSchema.parse(stageBInput), wire, table);
      const legacyInput = {
        contractVersion: '3.0.0' as const, runId: 'p3-shadow', platform, intent: stageA.resolvedOutput!,
        facts: plannerContext.facts, evidence: plannerContext.evidence, clarifications: plannerContext.clarifications,
        patterns: plannerContext.patterns, allowedCanonicalFunctions: plannerContext.allowedCanonicalFunctions,
        topologyConstraints: p36WorkflowSkeletonInputSchema.parse(stageBInput).topologyConstraints,
      };
      skeletonIssues = [...semanticIssues, ...validateP3Skeleton(legacyInput, resolved)];
      return { resolved, issues: skeletonIssues };
    });
    const orchestrator = new DistributedPlannerOrchestrator({ totalTimeoutMs: this.options.totalTimeoutMs, maximumConcurrency: 1, cacheEnabled: this.options.cacheEnabled }, this.cache);
    const common = { contractVersion: distributedPlannerContractVersion, version: '1.2.0', enabled: true, cachePolicy: { enabled: this.options.cacheEnabled } } as const;
    const a: DistributedStageDefinition = { ...common, inputContractVersion: p36ContractVersion, instanceId: 'stage-a-intent', stageId: 'business-intent', dependencies: [], timeoutMs: this.options.stageATimeoutMs, retryPolicy: { maximumRetries: this.options.maximumRetries, retryableCategories: ['malformed-model-output', 'invalid-output'] }, inputSchema: p36BusinessIntentInputSchema, outputSchema: p36BusinessIntentOutputSchema, buildInput: () => intentInput, runner: stageA };
    const b: DistributedStageDefinition = { ...common, inputContractVersion: p37SkeletonContractVersion, instanceId: 'stage-b-skeleton', stageId: 'workflow-skeleton', dependencies: ['stage-a-intent'], timeoutMs: this.options.stageBTimeoutMs, retryPolicy: { maximumRetries: Math.min(1, this.options.maximumRetries), retryableCategories: ['malformed-model-output', 'invalid-output'] }, inputSchema: p36WorkflowSkeletonInputSchema, outputSchema: p36WorkflowSkeletonOutputSchema, buildInput: (_context, upstream) => (stageBInput = buildP36SkeletonInput('p3-shadow', plannerContext, p36BusinessIntentOutputSchema.parse(upstream.get('stage-a-intent')), table)), runner: stageB };
    orchestrator.register(a); orchestrator.register(b);
    const report = await orchestrator.run({ rawScope: objective, normalizedScopeHash: contentHash(objective), platform, detectorVersion: analysis.facts[0]?.confidence.scoringRuleVersion ?? '1.1.0', catalogVersion: analysis.knowledgeContext.catalogVersion }, { ...(signal ? { signal } : {}) });
    const blockers = plannerContext.clarifications.length > 0;
    const status = report.status === 'cancelled' ? 'cancelled' : report.status === 'failed' ? 'failed' : blockers ? 'blocked' : 'completed';
    return { status, intent: stageA.resolvedOutput, skeleton: stageB.resolvedOutput, intentValidation: intentIssues, skeletonValidation: skeletonIssues, report, metrics: { stageA: stageADelegate.metrics ?? [], stageB: stageBDelegate.metrics ?? [] }, productionWorkflowUnchanged: JSON.stringify(productionWorkflow) === productionSnapshot, persisted: false };
  }
}
