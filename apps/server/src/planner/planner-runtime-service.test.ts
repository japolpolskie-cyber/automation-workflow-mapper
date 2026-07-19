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
    expect(await new UnifiedPlannerRuntime('production', null, null).execute(provider, scope, 'make', analysis, leadQualificationWorkflow)).toEqual({});
  });

  it('routes shadow mode through the legacy comparison adapter', async () => {
    const compare = vi.fn(async () => comparison);
    const result = await new UnifiedPlannerRuntime('shadow', { compare } as never, null).execute(provider, scope, 'n8n', analysis, leadQualificationWorkflow);
    expect(compare).toHaveBeenCalledOnce(); expect(result.plannerShadow).toEqual(comparison);
    expect(result.v21Analysis).toMatchObject({ version: '2.1', shadowMode: true });
    expect(result.v22ConceptualGraph).toMatchObject({ graph: { version: '2.2', shadowMode: true, legacyK41Compatible: true }, validation: { valid: true } });
    expect(result.v23PlatformTranslation).toMatchObject({ version: '2.3A', shadowMode: true, selectedPlatform: 'n8n', diagnostics: { valid: true } });
    expect(result.v24GraphCritique).toMatchObject({
      conceptual: { version: '2.4A', shadowMode: true, graphKind: 'conceptual' },
      platform: { version: '2.4A', shadowMode: true, graphKind: 'platform', platform: 'n8n' },
    });
    expect(result.v24GraphRepair).toMatchObject({
      conceptual: { report: { version: '2.4B', shadowMode: true, graphKind: 'conceptual' } },
      platform: { report: { version: '2.4B', shadowMode: true, graphKind: 'platform', platform: 'n8n' } },
    });
    expect(result.v25AcceptanceMatrix).toMatchObject({
      version: '2.5',
      shadowMode: true,
      platforms: {
        n8n: { platform: 'n8n' },
        make: { platform: 'make' },
        zapier: { platform: 'zapier' },
      },
    });
  });

  it('supports deterministic mock mode without invoking AI', async () => {
    const result = await new UnifiedPlannerRuntime('mock', null, null).execute(provider, scope, 'n8n', analysis, leadQualificationWorkflow);
    expect(result.plannerShadow?.status).toBe('completed');
    expect(result.v21Analysis?.requirementAnalysis.applications.some((item) => item.value === 'Asana')).toBe(true);
    expect(result.v22ConceptualGraph?.validation.valid).toBe(true);
    expect(result.v23PlatformTranslation?.selectedPlatform).toBe('n8n');
    expect(result.v24GraphCritique?.conceptual.version).toBe('2.4A');
    expect(result.v24GraphRepair?.conceptual.report.version).toBe('2.4B');
    expect(result.v25AcceptanceMatrix?.version).toBe('2.5');
  });

  it('creates platform-specific V2.3B and V2.3C artifacts', async () => {
    const result = await new UnifiedPlannerRuntime('mock', null, null).execute(provider, scope, 'make', analysis, leadQualificationWorkflow);
    expect(result.v22ConceptualGraph).toBeDefined();
    expect(result.v23PlatformTranslation).toMatchObject({ version: '2.3B', selectedPlatform: 'make', shadowMode: true });
    const zapier = await new UnifiedPlannerRuntime('mock', null, null).execute(provider, scope, 'zapier', analysis, leadQualificationWorkflow);
    expect(zapier.v23PlatformTranslation).toMatchObject({ version: '2.3C', selectedPlatform: 'zapier', shadowMode: true });
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
