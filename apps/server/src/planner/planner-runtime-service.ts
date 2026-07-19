import {
  plannerShadowComparisonSchema,
  type CanonicalWorkflow,
  type DetectedProcessSummary,
  type PlannerFailureCategory,
  type PlannerShadowComparison,
  type Platform,
  type V21AnalysisArtifacts,
  type V22ConceptualGraphResult,
  type PlatformTranslationResult,
  type GraphCritiqueBundle,
  type GraphRepairBundle,
} from '@awm/shared';
import type { AnalysisProvider } from '../ai/providers/analysis-provider.js';
import type { Environment } from '../config/environment.js';
import type { P3ShadowExperimentService } from '../distributed-planner/p3-shadow-experiment.js';
import type { PlannerShadowService } from './planner-shadow-service.js';
import type { P4DeterministicPlannerService } from './p4-deterministic-planner-service.js';
import { V21AnalysisService } from './v2-analysis-service.js';
import { DeterministicSkeletonCompiler } from './deterministic-skeleton-compiler.js';
import { N8nConceptualTranslator } from './n8n-translator.js';
import { MakeConceptualTranslator } from './make-translator.js';
import { ZapierConceptualTranslator } from './zapier-translator.js';
import { PlatformTranslatorRegistry } from './platform-translator.js';
import { GraphCritic } from './graph-critic.js';
import { SafeGraphRepairService } from './safe-graph-repair.js';

export type PlannerRuntimeMode = 'production' | 'shadow' | 'distributed' | 'mock';

export interface PlannerRuntimeResult {
  plannerShadow?: PlannerShadowComparison;
  v21Analysis?: V21AnalysisArtifacts;
  v22ConceptualGraph?: V22ConceptualGraphResult;
  v23PlatformTranslation?: PlatformTranslationResult;
  v24GraphCritique?: GraphCritiqueBundle;
  v24GraphRepair?: GraphRepairBundle;
}

export interface PlannerRuntime {
  readonly mode: PlannerRuntimeMode;
  execute(provider: AnalysisProvider, objective: string, platform: Platform, analysis: DetectedProcessSummary, productionWorkflow: CanonicalWorkflow, signal?: AbortSignal): Promise<PlannerRuntimeResult>;
}

export function selectPlannerRuntimeMode(environment: Pick<Environment, 'PLANNER_RUNTIME_MODE' | 'K4_PLANNER_SHADOW' | 'P2_DISTRIBUTED_PLANNER' | 'P3_DISTRIBUTED_PLANNER'>): PlannerRuntimeMode {
  if (environment.PLANNER_RUNTIME_MODE) return environment.PLANNER_RUNTIME_MODE;
  if (environment.P3_DISTRIBUTED_PLANNER) return 'distributed';
  if (environment.P2_DISTRIBUTED_PLANNER) return 'mock';
  if (environment.K4_PLANNER_SHADOW) return 'shadow';
  return 'production';
}

const emptyComparison = (status: 'completed' | 'failed', error: string | null, latencyMs: number, failureCategory: PlannerFailureCategory | null): PlannerShadowComparison =>
  plannerShadowComparisonSchema.parse({
    status,
    groundedPlan: null,
    differences: { improvedDetections: [], lostDetections: [], unsupportedOperations: [], preservedClarifications: [] },
    metrics: {
      oldNodeCount: 0, groundedStepCount: 0, groundedEdgeCount: 0, promptCharacters: 0,
      retrievedKnowledgeCharacters: 0, planningLatencyMs: latencyMs, rawScopeCharacters: 0,
      estimatedPromptTokens: 0, generatedOutputCharacters: 0, timeToFirstByteMs: null,
      parseLatencyMs: 0, validationLatencyMs: 0, retryCount: 0, promptSectionCharacters: {},
    },
    diagnostic: { failureCategory, stage: status === 'completed' ? 'completed' : 'validation', cacheHit: false, compacted: true, cancelled: false },
    error,
  });

export class UnifiedPlannerRuntime implements PlannerRuntime {
  public constructor(
    public readonly mode: PlannerRuntimeMode,
    private readonly shadowRuntime: PlannerShadowService | null,
    private readonly distributedRuntime: P3ShadowExperimentService | null,
    private readonly deterministicRuntime: P4DeterministicPlannerService | null = null,
    private readonly v21AnalysisService = new V21AnalysisService(),
    private readonly skeletonCompiler = new DeterministicSkeletonCompiler(),
    private readonly translatorRegistry = new PlatformTranslatorRegistry([new N8nConceptualTranslator(), new MakeConceptualTranslator(), new ZapierConceptualTranslator()]),
    private readonly graphCritic = new GraphCritic(),
    private readonly graphRepair = new SafeGraphRepairService(graphCritic),
  ) {}

  public async execute(provider: AnalysisProvider, objective: string, platform: Platform, analysis: DetectedProcessSummary, productionWorkflow: CanonicalWorkflow, signal?: AbortSignal): Promise<PlannerRuntimeResult> {
    if (this.mode === 'production') return {};
    const v21Analysis = this.v21AnalysisService.analyze(objective, analysis);
    const v22ConceptualGraph = this.skeletonCompiler.compileV22(v21Analysis);
    const translator = this.translatorRegistry.get(platform);
    const v23PlatformTranslation = translator?.translate(v22ConceptualGraph.graph);
    const v24GraphCritique: GraphCritiqueBundle = {
      conceptual: this.graphCritic.critiqueConceptual(v22ConceptualGraph.graph),
      ...(v23PlatformTranslation ? { platform: this.graphCritic.critiquePlatform(v22ConceptualGraph.graph, v23PlatformTranslation) } : {}),
    };
    const v24GraphRepair = this.graphRepair.repair(v21Analysis, v22ConceptualGraph.graph, v23PlatformTranslation);
    const artifacts = { v21Analysis, v22ConceptualGraph, ...(v23PlatformTranslation ? { v23PlatformTranslation } : {}), v24GraphCritique, v24GraphRepair };
    if (this.mode === 'mock') return { plannerShadow: emptyComparison('completed', null, 0, null), ...artifacts };
    if (this.mode === 'shadow') {
      if (!this.shadowRuntime) return artifacts;
      return { plannerShadow: await this.shadowRuntime.compare(provider, objective, platform, analysis, productionWorkflow, signal), ...artifacts };
    }
    if (this.deterministicRuntime) {
      const started = performance.now();
      const result = await this.deterministicRuntime.run(objective, platform, analysis, productionWorkflow, signal);
      const failed = result.status === 'failed' || result.status === 'cancelled';
      const comparison = emptyComparison(failed ? 'failed' : 'completed', failed ? result.error : null, Number((performance.now() - started).toFixed(2)), failed ? 'validation_failure' : null);
      comparison.groundedPlan = result.plan;
      comparison.metrics.oldNodeCount = productionWorkflow.nodes.length;
      comparison.metrics.groundedStepCount = result.plan?.nodes.length ?? 0;
      comparison.metrics.groundedEdgeCount = result.plan?.edges.length ?? 0;
      comparison.metrics.promptCharacters = result.metrics.stageA.reduce((sum, item) => sum + item.promptCharacters, 0);
      comparison.metrics.generatedOutputCharacters = result.metrics.stageA.reduce((sum, item) => sum + item.outputCharacters, 0);
      comparison.metrics.validationLatencyMs = result.metrics.compilerLatencyMs;
      comparison.metrics.retryCount = result.metrics.retryCount;
      comparison.differences.preservedClarifications = result.intent?.unresolvedQuestions.map((item) => item.clarificationId) ?? [];
      return { plannerShadow: plannerShadowComparisonSchema.parse(comparison), ...artifacts };
    }
    if (!this.distributedRuntime) return { plannerShadow: emptyComparison('failed', 'Distributed planner runtime is not configured.', 0, 'unknown_provider_error'), ...artifacts };
    const started = performance.now();
    const result = await this.distributedRuntime.run(objective, platform, analysis, productionWorkflow, signal);
    const attempts = result.report.stages.reduce((total, stage) => total + Math.max(0, stage.attempts - 1), 0);
    const failed = result.status !== 'completed' && result.status !== 'blocked';
    const comparison = emptyComparison(failed ? 'failed' : 'completed', failed ? result.report.stages.find((stage) => stage.failure)?.failure?.cause ?? 'Distributed planner did not complete.' : null, Number((performance.now() - started).toFixed(2)), failed ? 'validation_failure' : null);
    comparison.metrics.oldNodeCount = productionWorkflow.nodes.length;
    comparison.metrics.groundedStepCount = result.skeleton?.workflows.reduce((sum, workflow) => sum + workflow.nodes.length, 0) ?? 0;
    comparison.metrics.groundedEdgeCount = result.skeleton?.workflows.reduce((sum, workflow) => sum + workflow.edges.length, 0) ?? 0;
    comparison.metrics.promptCharacters = [...result.metrics.stageA, ...result.metrics.stageB].reduce((sum, item) => sum + item.promptCharacters, 0);
    comparison.metrics.generatedOutputCharacters = [...result.metrics.stageA, ...result.metrics.stageB].reduce((sum, item) => sum + item.outputCharacters, 0);
    comparison.metrics.retryCount = attempts;
    comparison.differences.preservedClarifications = result.intent?.unresolvedQuestions.map((item) => item.clarificationId) ?? [];
    return { plannerShadow: plannerShadowComparisonSchema.parse(comparison), ...artifacts };
  }
}
