import { describe, expect, it } from 'vitest';
import { leadQualificationWorkflow } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import type { AnalysisProvider } from '../ai/providers/analysis-provider.js';
import { PlannerContextBuilder } from './planner-context-builder.js';
import { PlannerPromptBuilder } from './planner-prompt-builder.js';
import { PlannerShadowService } from './planner-shadow-service.js';
import { classifyPlannerFailure, PlannerRuntimeError } from './planner-runtime.js';

const scope = 'When an Asana task moves to Ready, retrieve task details and create a Google Drive folder.';
const analysis = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-16T00:00:00.000Z'));
const context = new PlannerContextBuilder().build(scope, 'n8n', analysis);
const prompt = new PlannerPromptBuilder().build(context);

const provider = (planGrounded: NonNullable<AnalysisProvider['planGrounded']>): AnalysisProvider => ({
  name: 'ollama',
  async analyze() { return leadQualificationWorkflow; },
  planGrounded,
  async getStatus() { return { provider: 'ollama', available: true, models: ['qwen3:8b'], message: 'ready' }; },
});

describe('K4.2 bounded local planner runtime', () => {
  it('compacts observability and does not duplicate the output schema in the user prompt', () => {
    expect(prompt.user).not.toContain('"confidence"');
    expect(prompt.user).not.toContain('"coverage"');
    expect(prompt.user).not.toContain('"reliability"');
    expect(prompt.user).not.toContain('"weight"');
    expect(prompt.user).not.toContain('"binaryConditions":{"type"');
    expect(prompt.sectionCharacterCounts['Output Schema']).toBeGreaterThan(0);
    expect(prompt.characterCount).toBe(Object.values(prompt.sectionCharacterCounts).reduce((sum, size) => sum + size, 0) + prompt.user.length - prompt.sections.reduce((sum, item) => sum + item.content.length, 0));
  });

  it('classifies a bounded timeout and never returns a partial graph', async () => {
    const result = await new PlannerShadowService(undefined, undefined, { timeoutMs: 15, maximumRetries: 0 }).compare(provider(async () => new Promise(() => undefined)), scope, 'n8n', analysis, leadQualificationWorkflow);
    expect(result.status).toBe('failed');
    expect(result.groundedPlan).toBeNull();
    expect(result.diagnostic?.failureCategory).toBe('timeout');
  });

  it('honors caller cancellation separately from timeout', async () => {
    const controller = new AbortController();
    const pending = new PlannerShadowService(undefined, undefined, { timeoutMs: 5_000, maximumRetries: 0 }).compare(provider(async (request) => new Promise((_resolve, reject) => request.signal?.addEventListener('abort', () => reject(request.signal?.reason), { once: true }))), scope, 'n8n', analysis, leadQualificationWorkflow, controller.signal);
    controller.abort();
    const result = await pending;
    expect(result.diagnostic).toMatchObject({ failureCategory: 'cancellation', cancelled: true });
  });

  it('rejects oversized output before parsing', async () => {
    const result = await new PlannerShadowService(undefined, undefined, { maximumOutputCharacters: 10, maximumRetries: 0 }).compare(provider(async () => 'x'.repeat(11)), scope, 'n8n', analysis, leadQualificationWorkflow);
    expect(result.diagnostic?.failureCategory).toBe('output_too_large');
  });

  it('retries invalid JSON only within the configured bound', async () => {
    let calls = 0;
    const result = await new PlannerShadowService(undefined, undefined, { maximumRetries: 1 }).compare(provider(async () => { calls += 1; return '{'; }), scope, 'n8n', analysis, leadQualificationWorkflow);
    expect(result.status).toBe('failed');
    expect(calls).toBe(2);
    expect(result.metrics.retryCount).toBe(1);
    expect(result.diagnostic?.failureCategory).toBe('invalid_json');
  });

  it('uses versioned deterministic context caching without caching model output', async () => {
    let calls = 0;
    const service = new PlannerShadowService(undefined, undefined, { maximumRetries: 0 });
    const failing = provider(async () => { calls += 1; throw new Error('connection failure'); });
    const first = await service.compare(failing, scope, 'n8n', analysis, leadQualificationWorkflow);
    const second = await service.compare(failing, scope, 'n8n', analysis, leadQualificationWorkflow);
    expect(first.diagnostic?.cacheHit).toBe(false);
    expect(second.diagnostic?.cacheHit).toBe(true);
    expect(calls).toBe(2);
  });

  it('rejects context over budget before calling the provider', async () => {
    let calls = 0;
    const result = await new PlannerShadowService(undefined, undefined, { contextBudget: 100, maximumRetries: 0 }).compare(provider(async () => { calls += 1; return {}; }), scope, 'n8n', analysis, leadQualificationWorkflow);
    expect(result.diagnostic?.failureCategory).toBe('context_too_large');
    expect(calls).toBe(0);
  });

  it.each([
    [new Error('Ollama is not reachable'), 'ollama_unavailable'],
    [new Error('fetch failed'), 'connection_failure'],
    [new Error('invalid JSON'), 'invalid_json'],
    [new Error('schema parse failed'), 'schema_mismatch'],
    [new Error('invented unsupported operation'), 'unsupported_reference'],
    [new Error('incomplete unreachable graph'), 'incomplete_graph'],
    [new Error('graph validation failed'), 'validation_failure'],
    [new Error('unrecognized provider fault'), 'unknown_provider_error'],
    [new PlannerRuntimeError('cancellation', 'cancelled'), 'cancellation'],
  ] as const)('classifies %s as %s', (error, category) => {
    expect(classifyPlannerFailure(error)).toBe(category);
  });
});
