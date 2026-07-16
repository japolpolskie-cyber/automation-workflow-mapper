import { describe, expect, it } from 'vitest';
import { stageCNodeGroundingInputSchema, type StageCNodeGroundingInput } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { PlannerContextBuilder } from './planner-context-builder.js';
import { DeterministicSkeletonCompiler } from './deterministic-skeleton-compiler.js';
import { buildStageCCandidates, StageCNodeGrounder } from './stage-c-node-grounder.js';
import { StageCGroundingService } from './stage-c-grounding-service.js';

const input = (overrides: Partial<StageCNodeGroundingInput> = {}): StageCNodeGroundingInput => {
  const candidates = buildStageCCandidates(overrides.canonicalFunctionId ?? 'action', overrides.platform ?? 'n8n');
  return stageCNodeGroundingInputSchema.parse({
    contractVersion: '1.0.0', nodeId: 'node-1', canonicalFunctionId: 'action',
    semanticRole: 'data-transformation', purpose: 'Create a Google Drive folder',
    platform: 'n8n', relevantFacts: [{ id: 'fact-1', kind: 'application', value: 'Google Drive', entityId: null }],
    evidenceReferences: ['evidence-1'], inputCardinality: 'single', expectedOutputCardinality: 'single',
    patternReferences: [], candidates, blockingClarificationReferences: [],
    symbolTableSnapshotHash: 'snapshot', applicationPackVersion: '1.0.0', capabilityCatalogVersion: '1.0.0',
    ...overrides,
  });
};

describe('Stage C capability-constrained grounding', () => {
  it('deterministically selects one explicitly supported operation', async () => {
    const result = await new StageCNodeGrounder().ground(input(), new AbortController().signal);
    expect(result.node).toMatchObject({
      applicationId: 'google-drive', operationId: 'create-folder',
      groundingMethod: 'deterministic', platformMappingStatus: 'native',
    });
    expect(result.node.selectedApplicationSymbol).toBeTypeOf('number');
    expect(result.node.selectedOperationSymbol).toBeTypeOf('number');
  });

  it('distinguishes Drive folder search from unrelated retrieval operations', async () => {
    const result = await new StageCNodeGrounder().ground(input({
      canonicalFunctionId: 'data-retrieval', semanticRole: 'data-retrieval',
      purpose: 'Search Google Drive folder',
      relevantFacts: [{ id: 'fact-1', kind: 'application', value: 'Google Drive', entityId: 'folder' }],
      candidates: buildStageCCandidates('data-retrieval', 'n8n'),
      expectedOutputCardinality: 'unknown',
    }), new AbortController().signal);
    expect(result.node).toMatchObject({ applicationId: 'google-drive', operationId: 'find-folder' });
  });

  it('does not pass a collection directly to Google Sheets Add Row', async () => {
    const result = await new StageCNodeGrounder().ground(input({
      purpose: 'Add all entries to Google Sheets',
      relevantFacts: [{ id: 'fact-1', kind: 'application', value: 'Google Sheets', entityId: 'entry' }],
      inputCardinality: 'collection', expectedOutputCardinality: 'single',
    }), new AbortController().signal);
    expect(result.node.operationId).not.toBe('add-row');
    expect(result.node.groundingMethod).toBe('unresolved');
    expect(result.node.unresolvedRequirement).toMatch(/cardinality/i);
  });

  it('returns an explicit unresolved limitation for Shopify fulfillment', async () => {
    const result = await new StageCNodeGrounder().ground(input({
      purpose: 'Fulfill a paid Shopify order', relevantFacts: [{ id: 'fact-shopify', kind: 'application', value: 'Shopify', entityId: 'order' }],
    }), new AbortController().signal);
    expect(result.node.groundingMethod).toBe('unresolved');
    expect(result.node.operationId).toBeNull();
    expect(result.node.unresolvedRequirement).toMatch(/multiple supported|no supported/i);
  });

  it('rejects model symbols outside the bounded node table', async () => {
    const selector = { modelId: 'test', async select() { return { applicationSymbol: 999, operationSymbol: 999, reason: 'invented' }; } };
    const ambiguous = input({ purpose: 'Perform action', relevantFacts: [] });
    await expect(new StageCNodeGrounder(selector).ground(ambiguous, new AbortController().signal)).rejects.toThrow(/unknown or wrong-namespace/i);
  });

  it('preserves P4 topology, isolates unresolved nodes, and reuses cached results', async () => {
    const scope = 'When Gmail receives a message with attachments, process each attachment and upload every file to Google Drive.';
    const analysis = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-16T00:00:00.000Z'));
    const context = new PlannerContextBuilder().build(scope, 'make', analysis);
    const compiled = new DeterministicSkeletonCompiler().compile(context);
    const service = new StageCGroundingService({ enabled: true, maximumConcurrency: 4, nodeTimeoutMs: 5_000, maximumRetries: 1, cacheEnabled: true, maximumOutputCharacters: 30_000 });
    const first = await service.ground(compiled.plan, context);
    const second = await service.ground(compiled.plan, context);
    expect(first.topologyUnchanged).toBe(true);
    expect(first.metrics.topologyMutations).toBe(0);
    expect(first.metrics.invalidReferences).toBe(0);
    expect(first.metrics.roleOperationMismatches).toBe(0);
    expect(first.metrics.cardinalityMismatches).toBe(0);
    expect(first.nodes).toHaveLength(compiled.plan.nodes.length);
    expect(second.metrics.cacheHits).toBe(compiled.plan.nodes.length);
    expect(second.persisted).toBe(false);
  });
});
