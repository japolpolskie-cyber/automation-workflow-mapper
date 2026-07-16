import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { distributedPlannerContractVersion } from '@awm/shared';
import { DistributedPlannerOrchestrator, DistributedStageError, type DistributedStageDefinition, type ModelNeutralStageRunner } from './distributed-planner-orchestrator.js';
import { assertStageTransition, canTransitionStage } from './stage-lifecycle.js';
import { contentHash, InMemoryStageCache, type StageCache } from './stage-cache.js';

const inputSchema = z.object({ value: z.string(), upstream: z.array(z.string()) }).strict();
const outputSchema = z.object({ value: z.string() }).strict();
const context = { rawScope: 'Asana CRM', normalizedScopeHash: contentHash('Asana CRM'), platform: 'n8n' as const, detectorVersion: '1.1.0', catalogVersion: '1.0.0' };
const policy = { totalTimeoutMs: 1_000, maximumConcurrency: 2, cacheEnabled: true };
const runner = (run: ModelNeutralStageRunner['run'], id = 'deterministic-mock'): ModelNeutralStageRunner => ({ runnerId: id, modelId: null, run });
const definition = (instanceId: string, dependencies: string[], run: ModelNeutralStageRunner['run'], overrides: Partial<DistributedStageDefinition> = {}): DistributedStageDefinition => ({
  instanceId, stageId: 'business-intent', version: '1.0.0', contractVersion: distributedPlannerContractVersion,
  inputContractVersion: '1.0.0', dependencies, enabled: true, timeoutMs: 100,
  retryPolicy: { maximumRetries: 0, retryableCategories: [] }, cachePolicy: { enabled: true },
  inputSchema, outputSchema,
  buildInput: (_context, upstream) => ({ value: instanceId, upstream: [...upstream.values()].map((item) => (item as { value: string }).value) }),
  runner: runner(run), ...overrides,
});

describe('P2 stage lifecycle', () => {
  it('accepts only deterministic state transitions', () => {
    expect(canTransitionStage('pending', 'ready')).toBe(true);
    expect(canTransitionStage('running', 'succeeded')).toBe(true);
    expect(canTransitionStage('succeeded', 'running')).toBe(false);
    expect(() => assertStageTransition('cache-hit', 'running')).toThrow(/Invalid/);
  });
});

describe('P2 deterministic distributed planner orchestrator', () => {
  it('orders valid dependencies', async () => {
    const order: string[] = []; const orchestrator = new DistributedPlannerOrchestrator(policy);
    orchestrator.register(definition('b', ['a'], async (_input, ctx) => { order.push(ctx.stageInstanceId); return { value: 'b' }; }));
    orchestrator.register(definition('a', [], async (_input, ctx) => { order.push(ctx.stageInstanceId); return { value: 'a' }; }));
    const report = await orchestrator.run(context);
    expect(order).toEqual(['a', 'b']); expect(report.stageSequence).toEqual(['a', 'b']); expect(report.status).toBe('completed');
  });

  it('rejects circular dependencies', async () => {
    const orchestrator = new DistributedPlannerOrchestrator(policy);
    orchestrator.register(definition('a', ['b'], async () => ({ value: 'a' })));
    orchestrator.register(definition('b', ['a'], async () => ({ value: 'b' })));
    await expect(orchestrator.run(context)).rejects.toThrow(/Circular/);
  });

  it('rejects missing dependencies and incompatible versions', async () => {
    const missing = new DistributedPlannerOrchestrator(policy);
    missing.register(definition('a', ['missing'], async () => ({ value: 'a' })));
    await expect(missing.run(context)).rejects.toThrow(/missing dependency/);
    const incompatible = new DistributedPlannerOrchestrator(policy);
    incompatible.register(definition('a', [], async () => ({ value: 'a' }), { version: '1.0.0' }));
    incompatible.register(definition('b', ['a'], async () => ({ value: 'b' }), { dependencyVersions: { a: '2.0.0' } }));
    await expect(incompatible.run(context)).rejects.toThrow(/requires a@2.0.0/);
  });

  it('enforces per-stage timeout even when a runner ignores cancellation', async () => {
    const orchestrator = new DistributedPlannerOrchestrator(policy);
    orchestrator.register(definition('a', [], async () => new Promise(() => undefined), { timeoutMs: 15 }));
    const report = await orchestrator.run(context);
    expect(report.status).toBe('failed'); expect(report.stages[0]).toMatchObject({ status: 'timed-out', failure: { category: 'timeout' } });
  });

  it('enforces total pipeline timeout and cleans up pending work', async () => {
    const orchestrator = new DistributedPlannerOrchestrator({ ...policy, totalTimeoutMs: 20 });
    orchestrator.register(definition('a', [], async () => new Promise(() => undefined), { timeoutMs: 500 }));
    orchestrator.register(definition('b', ['a'], async () => ({ value: 'b' })));
    const report = await orchestrator.run(context);
    expect(report.status).toBe('cancelled');
    expect(report.stages.map((item) => item.status)).toEqual(['timed-out', 'cancelled']);
  });

  it('supports caller cancellation and cleanup', async () => {
    const controller = new AbortController(); const orchestrator = new DistributedPlannerOrchestrator(policy);
    orchestrator.register(definition('a', [], async () => new Promise(() => undefined), { timeoutMs: 500 }));
    const pending = orchestrator.run(context, { signal: controller.signal }); controller.abort();
    const report = await pending;
    expect(report.status).toBe('cancelled'); expect(report.stages[0]?.failure?.category).toBe('cancellation');
  });

  it('reports cache miss then validated cache hit', async () => {
    let calls = 0; const cache = new InMemoryStageCache(); const orchestrator = new DistributedPlannerOrchestrator(policy, cache);
    orchestrator.register(definition('a', [], async () => { calls += 1; return { value: 'a' }; }));
    const first = await orchestrator.run(context); const second = await orchestrator.run(context);
    expect(first.stages[0]?.cache).toBe('miss'); expect(second.stages[0]?.status).toBe('cache-hit'); expect(calls).toBe(1);
  });

  it('invalidates cache naturally when a stage version changes', async () => {
    let calls = 0; const cache = new InMemoryStageCache();
    const first = new DistributedPlannerOrchestrator(policy, cache); first.register(definition('a', [], async () => { calls += 1; return { value: 'a' }; }, { version: '1.0.0' })); await first.run(context);
    const second = new DistributedPlannerOrchestrator(policy, cache); second.register(definition('a', [], async () => { calls += 1; return { value: 'a' }; }, { version: '1.1.0' })); const report = await second.run(context);
    expect(report.stages[0]?.cache).toBe('miss'); expect(calls).toBe(2);
  });

  it('rejects corrupt cache entries', async () => {
    const corrupt: StageCache = { async get() { throw new Error('cache corruption'); }, async set() {}, async invalidate() {} };
    const validating: StageCache = { async get(key) { const entry = await corrupt.get(key); if (entry && contentHash(entry.output) !== entry.outputHash) throw new Error('cache corruption'); return entry; }, async set() {}, async invalidate() {} };
    const orchestrator = new DistributedPlannerOrchestrator(policy, validating); orchestrator.register(definition('a', [], async () => ({ value: 'a' })));
    const report = await orchestrator.run(context);
    expect(report.stages[0]).toMatchObject({ status: 'failed', cache: 'corrupt', failure: { category: 'cache-corruption' } });
  });

  it('selectively retries only one eligible failed stage', async () => {
    let a = 0; let b = 0; const orchestrator = new DistributedPlannerOrchestrator({ ...policy, cacheEnabled: false });
    orchestrator.register(definition('a', [], async () => { a += 1; return { value: 'a' }; }));
    orchestrator.register(definition('b', ['a'], async () => { b += 1; if (b === 1) throw new DistributedStageError('malformed-model-output', 'bad output', true); return { value: 'b' }; }, { retryPolicy: { maximumRetries: 1, retryableCategories: ['malformed-model-output'] } }));
    const report = await orchestrator.run(context);
    expect(report.status).toBe('completed'); expect(a).toBe(1); expect(b).toBe(2); expect(report.stages[1]?.attempts).toBe(2);
  });

  it('never retries blocking clarification', async () => {
    let calls = 0; const orchestrator = new DistributedPlannerOrchestrator({ ...policy, cacheEnabled: false });
    orchestrator.register(definition('a', [], async () => { calls += 1; throw new DistributedStageError('blocking-clarification', 'owner missing', false); }, { retryPolicy: { maximumRetries: 2, retryableCategories: ['malformed-model-output'] } }));
    const report = await orchestrator.run(context);
    expect(report.status).toBe('blocked'); expect(calls).toBe(1); expect(report.stages[0]?.status).toBe('blocked-by-clarification');
  });

  it('skips downstream stages after dependency failure but continues independent work', async () => {
    let independent = 0; const orchestrator = new DistributedPlannerOrchestrator({ ...policy, cacheEnabled: false });
    orchestrator.register(definition('a', [], async () => { throw new Error('failed'); }));
    orchestrator.register(definition('b', ['a'], async () => ({ value: 'b' })));
    orchestrator.register(definition('c', [], async () => { independent += 1; return { value: 'c' }; }));
    const report = await orchestrator.run(context);
    expect(report.stages.find((item) => item.stageInstanceId === 'b')?.status).toBe('skipped'); expect(independent).toBe(1);
  });

  it('freezes stage inputs and accepts model-neutral runners', async () => {
    const orchestrator = new DistributedPlannerOrchestrator({ ...policy, cacheEnabled: false });
    const immutableRunner = runner(async (input) => {
      expect(Object.isFrozen(input)).toBe(true);
      expect(() => { (input as { value: string }).value = 'mutated'; }).toThrow();
      return { value: 'a' };
    }, 'provider-independent-mock');
    orchestrator.register(definition('a', [], immutableRunner.run, { runner: immutableRunner }));
    const report = await orchestrator.run(context);
    expect(report.stages[0]?.provenance?.runnerId).toBe('provider-independent-mock'); expect(report.persisted).toBe(false);
  });

  it('bypasses disabled stages without executing them', async () => {
    let calls = 0; const orchestrator = new DistributedPlannerOrchestrator(policy);
    orchestrator.register(definition('a', [], async () => { calls += 1; return { value: 'a' }; }, { enabled: false }));
    const report = await orchestrator.run(context);
    expect(report.stages[0]?.status).toBe('skipped'); expect(calls).toBe(0);
  });
});
