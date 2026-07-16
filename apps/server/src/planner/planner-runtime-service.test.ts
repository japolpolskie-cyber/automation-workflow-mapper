import { describe, expect, it, vi } from 'vitest';
import { leadQualificationWorkflow, type PlannerShadowComparison } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import type { AnalysisProvider } from '../ai/providers/analysis-provider.js';
import { selectPlannerRuntimeMode, UnifiedPlannerRuntime } from './planner-runtime-service.js';

const scope = 'When an Asana task moves to Ready, notify Slack.';
const analysis = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-16T00:00:00.000Z'));
const provider: AnalysisProvider = { name: 'local', async analyze() { return leadQualificationWorkflow; }, async getStatus() { return { provider: 'local', available: true, models: [], message: '' }; } };
const comparison = { status: 'completed', groundedPlan: null, differences: { improvedDetections: [], lostDetections: [], unsupportedOperations: [], preservedClarifications: [] }, metrics: { oldNodeCount: 0, groundedStepCount: 0, groundedEdgeCount: 0, promptCharacters: 0, retrievedKnowledgeCharacters: 0, planningLatencyMs: 0, rawScopeCharacters: 0, estimatedPromptTokens: 0, generatedOutputCharacters: 0, timeToFirstByteMs: null, parseLatencyMs: 0, validationLatencyMs: 0, retryCount: 0, promptSectionCharacters: {} }, diagnostic: { failureCategory: null, stage: 'completed', cacheHit: false, compacted: true, cancelled: false }, error: null } satisfies PlannerShadowComparison;

describe('unified planner runtime modes', () => {
  it('selects explicit mode first and otherwise honors legacy feature flags', () => {
    const base = { PLANNER_RUNTIME_MODE: undefined, K4_PLANNER_SHADOW: false, P2_DISTRIBUTED_PLANNER: false, P3_DISTRIBUTED_PLANNER: false };
    expect(selectPlannerRuntimeMode(base)).toBe('production');
    expect(selectPlannerRuntimeMode({ ...base, K4_PLANNER_SHADOW: true })).toBe('shadow');
    expect(selectPlannerRuntimeMode({ ...base, P2_DISTRIBUTED_PLANNER: true })).toBe('mock');
    expect(selectPlannerRuntimeMode({ ...base, P3_DISTRIBUTED_PLANNER: true })).toBe('distributed');
    expect(selectPlannerRuntimeMode({ ...base, PLANNER_RUNTIME_MODE: 'production', P3_DISTRIBUTED_PLANNER: true })).toBe('production');
  });
  it('keeps production mode free of planner side effects', async () => {
    expect(await new UnifiedPlannerRuntime('production', null, null).execute(provider, scope, 'n8n', analysis, leadQualificationWorkflow)).toEqual({});
  });

  it('routes shadow mode through the legacy comparison adapter', async () => {
    const compare = vi.fn(async () => comparison);
    const result = await new UnifiedPlannerRuntime('shadow', { compare } as never, null).execute(provider, scope, 'n8n', analysis, leadQualificationWorkflow);
    expect(compare).toHaveBeenCalledOnce(); expect(result.plannerShadow).toEqual(comparison);
  });

  it('supports deterministic mock mode without invoking AI', async () => {
    const result = await new UnifiedPlannerRuntime('mock', null, null).execute(provider, scope, 'n8n', analysis, leadQualificationWorkflow);
    expect(result.plannerShadow?.status).toBe('completed');
  });

  it('prefers the P4 deterministic compiler in distributed mode', async () => {
    const run = vi.fn(async () => ({
      status: 'completed' as const, intent: null, plan: null, intentValidation: [], compilerIssues: [], appliedPatterns: [],
      metrics: { stageA: [], compilerLatencyMs: 1, totalLatencyMs: 2, retryCount: 0 },
      productionWorkflowUnchanged: true, persisted: false as const, error: null,
    }));
    const result = await new UnifiedPlannerRuntime('distributed', null, null, { run } as never).execute(provider, scope, 'n8n', analysis, leadQualificationWorkflow);
    expect(run).toHaveBeenCalledOnce();
    expect(result.plannerShadow?.status).toBe('completed');
  });
});
