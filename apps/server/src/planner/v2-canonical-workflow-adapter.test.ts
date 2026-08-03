import { describe, expect, it } from 'vitest';
import { validateWorkflowGraph } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { UnifiedPlannerRuntime } from './planner-runtime-service.js';
import { V2CanonicalWorkflowAdapter } from './v2-canonical-workflow-adapter.js';

const requirement = 'For every attachment, process the file and combine all results into one report.';

function workflow() {
  const analysis = new ScopeIntelligenceService().analyze(requirement, new Date('2026-07-19T00:00:00.000Z'));
  const artifacts = new UnifiedPlannerRuntime('mock', null, null).buildV2Artifacts(requirement, 'n8n', analysis);
  return new V2CanonicalWorkflowAdapter().adapt('Iterator topology', requirement, artifacts.v24GraphRepair!.conceptual.graph, artifacts.v24GraphRepair!.platform!.graph);
}

describe('V2 canonical iterator topology', () => {
  it('preserves Each Item, Loop Back, and Completed edges with distinct handles', () => {
    const candidate = workflow();
    const iterator = candidate.nodes.find((node) => node.configuration.conceptualRole === 'collection-iterator')!;
    const aggregator = candidate.nodes.find((node) => node.configuration.conceptualRole === 'item-aggregator')!;
    expect(candidate.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceNodeId: iterator.id, sourcePort: 'item', label: 'Each Item', branchLabel: null }),
      expect.objectContaining({ targetNodeId: iterator.id, targetPort: 'loop-back', label: 'Loop Back', branchLabel: 'LOOP' }),
      expect.objectContaining({ sourceNodeId: iterator.id, targetNodeId: aggregator.id, sourcePort: 'done', label: 'Completed', branchLabel: 'DONE' }),
    ]));
    expect(validateWorkflowGraph(candidate).issues).toEqual([]);
  });

  it.each([
    ['item', (edge: ReturnType<typeof workflow>['connections'][number]) => edge.sourcePort === 'item'],
    ['loop-back', (edge: ReturnType<typeof workflow>['connections'][number]) => edge.targetPort === 'loop-back'],
    ['completion', (edge: ReturnType<typeof workflow>['connections'][number]) => edge.sourcePort === 'done'],
  ])('rejects a canonical iterator missing its %s edge', (_name, matches) => {
    const candidate = workflow();
    candidate.connections = candidate.connections.filter((edge) => !matches(edge));
    expect(validateWorkflowGraph(candidate).valid).toBe(false);
  });

  it('rejects wrong labels and handles, duplicate loop-backs, and orphaned aggregation', () => {
    const malformed = workflow();
    const iterator = malformed.nodes.find((node) => node.configuration.conceptualRole === 'collection-iterator')!;
    const item = malformed.connections.find((edge) => edge.sourceNodeId === iterator.id && edge.sourcePort === 'item')!;
    item.label = 'Loop Back';
    item.sourcePort = 'output';
    const loopBack = malformed.connections.find((edge) => edge.targetNodeId === iterator.id && edge.targetPort === 'loop-back')!;
    malformed.connections.push({ ...loopBack, id: crypto.randomUUID() });
    const completed = malformed.connections.find((edge) => edge.sourceNodeId === iterator.id && edge.sourcePort === 'done')!;
    const codes = validateWorkflowGraph(malformed).issues.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(['ITERATOR_ITEM_EDGE_REQUIRED', 'ITERATOR_LOOP_BACK_REQUIRED']));
    const orphaned = workflow();
    const orphanIterator = orphaned.nodes.find((node) => node.configuration.conceptualRole === 'collection-iterator')!;
    const orphanItem = orphaned.connections.find((edge) => edge.sourceNodeId === orphanIterator.id && edge.sourcePort === 'item')!;
    const orphanCompleted = orphaned.connections.find((edge) => edge.sourceNodeId === orphanIterator.id && edge.sourcePort === 'done')!;
    orphanCompleted.targetNodeId = orphanItem.targetNodeId;
    expect(validateWorkflowGraph(orphaned).issues.map((issue) => issue.code)).toContain('ITERATOR_PATHS_NOT_DISTINCT');
  });
});
