import { describe, expect, it } from 'vitest';
import { leadQualificationWorkflow, type CanonicalWorkflow, type WorkflowConnection } from '@awm/shared';
import { hardenProviderWorkflowTopology } from './provider-workflow-topology-integrity.js';

function edge(sourceNodeId: string, targetNodeId: string, overrides: Partial<WorkflowConnection> = {}): WorkflowConnection {
  return { ...leadQualificationWorkflow.connections[0]!, id: crypto.randomUUID(), sourceNodeId, targetNodeId, sourcePort: 'output', targetPort: 'input', label: '', branchLabel: null, routeType: 'success', style: 'success', condition: null, mappings: [], ...overrides };
}

function providerIterator(options: { item?: boolean; loopBack?: boolean; completed?: boolean } = {}): CanonicalWorkflow {
  const [triggerBase, iteratorBase, bodyBase, endBase] = leadQualificationWorkflow.nodes;
  const trigger = { ...structuredClone(triggerBase!), id: crypto.randomUUID(), category: 'trigger' as const, name: 'Receive collection' };
  const iterator = { ...structuredClone(iteratorBase!), id: crypto.randomUUID(), category: 'loop' as const, name: 'Split collection', operation: 'Split Out', configuration: {} };
  const body = { ...structuredClone(bodyBase!), id: crypto.randomUUID(), category: 'action' as const, name: 'Process item' };
  const end = { ...structuredClone(endBase!), id: crypto.randomUUID(), category: 'end' as const, name: 'Complete processing' };
  const connections = [edge(trigger.id, iterator.id)];
  if (options.item !== false) connections.push(edge(iterator.id, body.id, { sourcePort: 'item', label: 'Each Item', branchLabel: null, routeType: 'conditional', style: 'loop' }));
  if (options.loopBack !== false) connections.push(edge(body.id, iterator.id, { targetPort: 'loop-back', label: 'Loop Back', branchLabel: 'LOOP', routeType: 'conditional', style: 'loop' }));
  if (options.completed !== false) connections.push(edge(iterator.id, end.id, { sourcePort: 'done', label: 'Completed', branchLabel: 'DONE', style: 'success' }));
  return { ...structuredClone(leadQualificationWorkflow), id: crypto.randomUUID(), nodes: [trigger, iterator, body, end], connections, branches: [], warnings: [] };
}

describe('provider fallback iterator topology integrity', () => {
  it('repairs only a missing provider Each Item edge', () => {
    const input = providerIterator({ item: false });
    const result = hardenProviderWorkflowTopology(input);
    expect(result.repaired).toBe(true);
    expect(result.workflow.connections).toHaveLength(input.connections.length + 1);
    expect(result.workflow.connections).toEqual(expect.arrayContaining([expect.objectContaining({ sourcePort: 'item', targetPort: 'input', label: 'Each Item', branchLabel: null, style: 'loop' })]));
    expect(input.connections.some((item) => item.sourcePort === 'item')).toBe(false);
    expect(result.outcome).toBe('provider-iterator-repaired-item-only');
  });

  it('repairs missing Each Item and Completed edges when both boundaries are unique', () => {
    const input = providerIterator({ item: false, completed: false });
    const result = hardenProviderWorkflowTopology(input);
    expect(result.outcome).toBe('provider-iterator-repaired-item-and-completed');
    expect(result.workflow.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourcePort: 'item', targetPort: 'input', label: 'Each Item' }),
      expect.objectContaining({ sourcePort: 'done', targetPort: 'input', label: 'Completed', branchLabel: 'DONE' }),
    ]));
  });

  it('leaves a valid provider iterator byte-for-byte unchanged', () => {
    const input = providerIterator();
    expect(hardenProviderWorkflowTopology(input)).toMatchObject({ workflow: input, issues: [], repaired: false });
  });

  it.each([
    ['Loop Back', { item: false, loopBack: false }],
    ['Completed', { item: true, completed: false }],
  ])('does not guess a missing %s path', (_name, options) => {
    const result = hardenProviderWorkflowTopology(providerIterator(options));
    expect(result.repaired).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('does not repair ambiguous bodies or duplicate an existing item edge', () => {
    const ambiguous = providerIterator({ item: false });
    const iterator = ambiguous.nodes.find((node) => node.category === 'loop')!;
    const secondBody = { ...ambiguous.nodes[2]!, id: crypto.randomUUID(), name: 'Other body' };
    ambiguous.nodes.push(secondBody);
    ambiguous.connections.push(edge(secondBody.id, iterator.id, { targetPort: 'loop-back', label: 'Loop Back', branchLabel: 'LOOP', routeType: 'conditional', style: 'loop' }));
    const ambiguousResult = hardenProviderWorkflowTopology(ambiguous);
    expect(ambiguousResult.repaired).toBe(false);
    expect(ambiguousResult.outcome).toBe('provider-iterator-repair-skipped-ambiguous-body');

    const duplicate = providerIterator();
    const item = duplicate.connections.find((connection) => connection.sourcePort === 'item')!;
    duplicate.connections.push({ ...item, id: crypto.randomUUID() });
    const result = hardenProviderWorkflowTopology(duplicate);
    expect(result.repaired).toBe(false);
    expect(result.workflow.connections).toHaveLength(duplicate.connections.length);
  });

  it('warns on incorrect handles and contradictory Completed routing without rewriting them', () => {
    const input = providerIterator();
    const item = input.connections.find((connection) => connection.sourcePort === 'item')!;
    item.sourcePort = 'output'; item.label = 'Each Item';
    const completed = input.connections.find((connection) => connection.sourcePort === 'done')!;
    completed.targetNodeId = item.targetNodeId;
    const result = hardenProviderWorkflowTopology(input);
    expect(result.repaired).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['PROVIDER_ITERATOR_ITEM_SEMANTICS_INVALID', 'PROVIDER_ITERATOR_PATHS_CONTRADICT']));
    expect(result.workflow.connections).toEqual(input.connections);
  });

  it('does not convert ordinary fan-out into an iterator', () => {
    const input = providerIterator({ item: false, loopBack: false, completed: false });
    input.nodes = input.nodes.filter((node) => node.category !== 'loop');
    input.connections = [edge(input.nodes[0]!.id, input.nodes[1]!.id), edge(input.nodes[0]!.id, input.nodes[2]!.id)];
    const result = hardenProviderWorkflowTopology(input);
    expect(result.repaired).toBe(false);
    expect(result.workflow.connections).toEqual(input.connections);
  });

  it('does not repair when multiple iterators exist', () => {
    const input = providerIterator({ item: false });
    input.nodes.push({ ...input.nodes.find((node) => node.category === 'loop')!, id: crypto.randomUUID() });
    const result = hardenProviderWorkflowTopology(input);
    expect(result.repaired).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'PROVIDER_ITERATOR_AMBIGUOUS')).toBe(true);
  });

  it('does not repair an ambiguous completion destination', () => {
    const input = providerIterator({ item: false, completed: false });
    input.nodes.push({ ...input.nodes.at(-1)!, id: crypto.randomUUID(), name: 'Other continuation' });
    const result = hardenProviderWorkflowTopology(input);
    expect(result.outcome).toBe('provider-iterator-repair-skipped-ambiguous-completion');
    expect(result.workflow.connections.some((edge) => edge.sourcePort === 'item' || edge.sourcePort === 'done')).toBe(false);
  });

  it('preserves a required aggregator as the repaired completion destination', () => {
    const input = providerIterator({ item: false, completed: false });
    const end = input.nodes.at(-1)!;
    const aggregator = { ...input.nodes[2]!, id: crypto.randomUUID(), name: 'Aggregate results', operation: 'Aggregate', configuration: { conceptualRole: 'item-aggregator' } };
    input.nodes.splice(input.nodes.length - 1, 0, aggregator);
    input.connections.push(edge(aggregator.id, end.id));
    const result = hardenProviderWorkflowTopology(input);
    expect(result.outcome).toBe('provider-iterator-repaired-item-and-completed');
    expect(result.workflow.connections).toContainEqual(expect.objectContaining({ sourcePort: 'done', targetNodeId: aggregator.id }));
  });

  it('emits only the repair outcome and warning codes through diagnostics', () => {
    const diagnostics: unknown[] = [];
    hardenProviderWorkflowTopology(providerIterator({ item: false, completed: false }), (diagnostic) => diagnostics.push(diagnostic));
    expect(diagnostics).toEqual([{ outcome: 'provider-iterator-repaired-item-and-completed', warningCodes: [] }]);
  });

  it('emits the invalid-ports outcome without adding either missing edge', () => {
    const input = providerIterator({ item: false, completed: false });
    const loopBack = input.connections.find((connection) => connection.label === 'Loop Back')!;
    loopBack.targetPort = 'input';
    const result = hardenProviderWorkflowTopology(input);
    expect(result.outcome).toBe('provider-iterator-repair-skipped-invalid-ports');
    expect(result.workflow.connections.some((edge) => edge.sourcePort === 'item' || edge.sourcePort === 'done')).toBe(false);
  });
});
