import { describe, expect, it } from 'vitest';
import { loadEnvironment } from './environment.js';

describe('AI environment validation', () => {
  it('keeps Hybrid RAG off by default and accepts only reserved modes', () => {
    expect(loadEnvironment({}).HYBRID_RAG_MODE).toBe('off');
    for (const mode of ['compare', 'guarded', 'enabled'] as const) {
      expect(loadEnvironment({ HYBRID_RAG_MODE: mode }).HYBRID_RAG_MODE).toBe(mode);
    }
    expect(() => loadEnvironment({ HYBRID_RAG_MODE: 'invalid' })).toThrow(/HYBRID_RAG_MODE/);
    expect(loadEnvironment({})).toMatchObject({
      HYBRID_RAG_RETRIEVAL_TIMEOUT_MS: 1_500,
      HYBRID_RAG_MAX_RESULTS: 6,
      HYBRID_RAG_MAX_CHUNK_CHARS: 800,
      HYBRID_RAG_MAX_CONTEXT_CHARS: 4_000,
    });
  });
  it('allows local analysis without a key', () => { expect(loadEnvironment({ AI_PROVIDER: 'local' }).AI_PROVIDER).toBe('local'); });
  it('requires a server key for OpenAI mode', () => { expect(() => loadEnvironment({ AI_PROVIDER: 'openai' })).toThrow(/OPENAI_API_KEY/); });
  it('can remove K4 shadow planning without disabling K3 analysis', () => { const environment = loadEnvironment({ K3_SCOPE_INTELLIGENCE: 'true', K4_PLANNER_SHADOW: 'false' }); expect(environment.K3_SCOPE_INTELLIGENCE).toBe(true); expect(environment.K4_PLANNER_SHADOW).toBe(false); });
  it('provides bounded K4.2 runtime defaults', () => {
    const environment = loadEnvironment({});
    expect(environment).toMatchObject({ K4_PLANNER_TIMEOUT_MS: 180_000, K4_PLANNER_MAX_OUTPUT_CHARS: 120_000, K4_PLANNER_MAX_RETRIES: 1, K4_PLANNER_CONTEXT_BUDGET: 24_000 });
  });
  it('keeps the P2 distributed planner disabled by default with bounded runtime settings', () => {
    const environment = loadEnvironment({});
    expect(environment).toMatchObject({ P2_DISTRIBUTED_PLANNER: false, P2_DISTRIBUTED_PLANNER_TOTAL_TIMEOUT_MS: 300_000, P2_DISTRIBUTED_PLANNER_STAGE_TIMEOUT_MS: 60_000, P2_DISTRIBUTED_PLANNER_MAX_RETRIES: 1, P2_DISTRIBUTED_PLANNER_CONCURRENCY: 2, P2_DISTRIBUTED_PLANNER_CACHE: true });
  });
  it('keeps the P3 live Stage A/B experiment disabled by default with bounded local-model settings', () => {
    const environment = loadEnvironment({});
    expect(environment).toMatchObject({ P3_DISTRIBUTED_PLANNER: false, P3_STAGE_A_TIMEOUT_MS: 180_000, P3_STAGE_B_TIMEOUT_MS: 240_000, P3_TOTAL_TIMEOUT_MS: 480_000, P3_STAGE_MAX_RETRIES: 1, P3_STAGE_MAX_OUTPUT_CHARS: 60_000, P3_CACHE_ENABLED: true });
  });
  it('supports an explicit consolidated planner runtime mode without changing the compatible default', () => {
    expect(loadEnvironment({}).PLANNER_RUNTIME_MODE).toBeUndefined();
    expect(loadEnvironment({}).PLANNER_V2_PROMOTION_MODE).toBe('disabled');
    expect(loadEnvironment({}).PLANNER_V2_ALLOW_PASS_WITH_WARNINGS).toBe(false);
    expect(loadEnvironment({ PLANNER_RUNTIME_MODE: 'distributed' }).PLANNER_RUNTIME_MODE).toBe('distributed');
    expect(loadEnvironment({ PLANNER_V2_PROMOTION_MODE: 'guarded', PLANNER_V2_ALLOW_PASS_WITH_WARNINGS: 'true' })).toMatchObject({ PLANNER_V2_PROMOTION_MODE: 'guarded', PLANNER_V2_ALLOW_PASS_WITH_WARNINGS: true });
  });
  it('keeps Stage C disabled by default with bounded node-grounding controls', () => {
    expect(loadEnvironment({})).toMatchObject({
      STAGE_C_NODE_GROUNDING: false, STAGE_C_MAX_CONCURRENCY: 4,
      STAGE_C_NODE_TIMEOUT_MS: 120_000, STAGE_C_MAX_RETRIES: 1,
      STAGE_C_CACHE_ENABLED: true, STAGE_C_MAX_OUTPUT_CHARS: 30_000,
      STAGE_D_EDGE_GROUNDING: false, STAGE_D_MAX_CONCURRENCY: 4,
      STAGE_D_EDGE_TIMEOUT_MS: 120_000, STAGE_D_MAX_RETRIES: 1,
      STAGE_D_CACHE_ENABLED: true, STAGE_D_MAX_OUTPUT_CHARS: 30_000,
    });
  });
});
