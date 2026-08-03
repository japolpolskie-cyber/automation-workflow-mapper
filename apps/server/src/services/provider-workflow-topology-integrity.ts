import type { CanonicalWorkflow, GraphIssue, WorkflowConnection, WorkflowNode } from '@awm/shared';

export interface ProviderTopologyIntegrityResult {
  workflow: CanonicalWorkflow;
  issues: GraphIssue[];
  repaired: boolean;
  outcome: ProviderIteratorRepairOutcome | null;
}
export type ProviderIteratorRepairOutcome =
  | 'provider-iterator-repaired-item-only'
  | 'provider-iterator-repaired-item-and-completed'
  | 'provider-iterator-repair-skipped-ambiguous-body'
  | 'provider-iterator-repair-skipped-ambiguous-completion'
  | 'provider-iterator-repair-skipped-invalid-ports';
export interface ProviderIteratorRepairDiagnostic { outcome: ProviderIteratorRepairOutcome; warningCodes: string[] }

const iteratorOperation = /^(?:split out|loop over items|iterator|create loop from line items)$/i;

export function hardenProviderWorkflowTopology(input: CanonicalWorkflow, observe: (diagnostic: ProviderIteratorRepairDiagnostic) => void = () => {}): ProviderTopologyIntegrityResult {
  const workflow = structuredClone(input);
  const issues: GraphIssue[] = [];
  const iterators = workflow.nodes.filter(isIteratorCandidate);
  let outcome: ProviderIteratorRepairOutcome | null = null;

  if (iterators.length > 1) {
    for (const iterator of iterators) warn(issues, 'PROVIDER_ITERATOR_AMBIGUOUS', 'Multiple iterator boundaries prevent conservative topology repair.', iterator.id);
  } else if (iterators.length === 1) {
    outcome = inspectIterator(workflow, iterators[0]!, issues);
  }

  validateReachability(workflow, issues);
  if (issues.length) {
    const messages = issues.map((issue) => `Topology warning [${issue.code}]: ${issue.message}`);
    workflow.warnings = [...new Set([...workflow.warnings, ...messages])];
  }
  const repaired = outcome === 'provider-iterator-repaired-item-only' || outcome === 'provider-iterator-repaired-item-and-completed';
  if (repaired) workflow.updatedAt = new Date().toISOString();
  if (outcome) observe({ outcome, warningCodes: [...new Set(issues.map((issue) => issue.code))] });
  return { workflow, issues, repaired, outcome };
}

function inspectIterator(workflow: CanonicalWorkflow, iterator: WorkflowNode, issues: GraphIssue[]): ProviderIteratorRepairOutcome | null {
  const outgoing = workflow.connections.filter((edge) => edge.sourceNodeId === iterator.id);
  const incoming = workflow.connections.filter((edge) => edge.targetNodeId === iterator.id);
  const itemEdges = outgoing.filter(isItemEdge);
  const completions = outgoing.filter(isCompletionEdge);
  const loopBacks = incoming.filter(isLoopBackEdge);

  if (itemEdges.length === 1 && completions.length === 1 && loopBacks.length === 1) {
    validateExistingTopology(iterator, itemEdges[0]!, completions[0]!, loopBacks[0]!, issues);
    return null;
  }
  if (itemEdges.length > 1) warn(issues, 'PROVIDER_ITERATOR_DUPLICATE_ITEM_PATH', 'Iterator has multiple item outputs; no repair was attempted.', iterator.id);
  if (loopBacks.length !== 1) warn(issues, 'PROVIDER_ITERATOR_LOOP_BACK_AMBIGUOUS', 'Iterator requires exactly one explicit Loop Back input before an item path can be repaired.', iterator.id);
  if (completions.length > 1 || (completions.length === 0 && itemEdges.length > 0)) warn(issues, 'PROVIDER_ITERATOR_COMPLETION_AMBIGUOUS', 'Iterator completion topology is incomplete or ambiguous.', iterator.id);
  if (itemEdges.length === 0 && loopBacks.length > 1) return 'provider-iterator-repair-skipped-ambiguous-body';
  if (itemEdges.length !== 0 || loopBacks.length !== 1 || completions.length > 1) return null;

  if (!validLoopBack(loopBacks[0]!)) {
    warn(issues, 'PROVIDER_ITERATOR_REPAIR_INVALID_PORTS', 'Iterator Loop Back metadata is not canonical; no boundary edges were added.', iterator.id, loopBacks[0]!.id);
    return 'provider-iterator-repair-skipped-invalid-ports';
  }

  if (completions.length === 0) {
    if (outgoing.length) {
      warn(issues, 'PROVIDER_ITERATOR_AMBIGUOUS_COMPLETION', 'Existing iterator fan-out prevents inference of a Completed destination.', iterator.id);
      return 'provider-iterator-repair-skipped-ambiguous-completion';
    }
    return repairItemAndCompletion(workflow, iterator, loopBacks[0]!, issues);
  }

  const body = workflow.nodes.find((node) => node.id === loopBacks[0]!.sourceNodeId);
  const completionTarget = workflow.nodes.find((node) => node.id === completions[0]!.targetNodeId);
  const contradictory = !body || !completionTarget || body.id === iterator.id || completionTarget.id === body.id
    || outgoing.some((edge) => edge.targetNodeId === body.id)
    || loopBacks[0]!.targetPort !== 'loop-back'
    || !validCompletion(completions[0]!);
  if (contradictory) {
    warn(issues, 'PROVIDER_ITERATOR_REPAIR_UNSAFE', 'Iterator roles or ports are contradictory; the missing item path was not invented.', iterator.id);
    return !validLoopBack(loopBacks[0]!) || !validCompletion(completions[0]!) ? 'provider-iterator-repair-skipped-invalid-ports' : null;
  }

  workflow.connections.push(eachItemEdge(iterator.id, body.id));
  return 'provider-iterator-repaired-item-only';
}

function repairItemAndCompletion(workflow: CanonicalWorkflow, iterator: WorkflowNode, loopBack: WorkflowConnection, issues: GraphIssue[]): ProviderIteratorRepairOutcome {
  const body = bodyBoundary(workflow, iterator.id, loopBack.sourceNodeId);
  if (!body) {
    warn(issues, 'PROVIDER_ITERATOR_AMBIGUOUS_BODY', 'The iterator body entry is not uniquely determined; no boundary edges were added.', iterator.id);
    return 'provider-iterator-repair-skipped-ambiguous-body';
  }
  const completion = completionBoundary(workflow, iterator.id, body.nodeIds);
  if (!completion) {
    warn(issues, 'PROVIDER_ITERATOR_AMBIGUOUS_COMPLETION', 'The post-loop continuation is not uniquely determined; no boundary edges were added.', iterator.id);
    return 'provider-iterator-repair-skipped-ambiguous-completion';
  }
  workflow.connections.push(eachItemEdge(iterator.id, body.entryId), completedEdge(iterator.id, completion.id));
  return 'provider-iterator-repaired-item-and-completed';
}

function bodyBoundary(workflow: CanonicalWorkflow, iteratorId: string, tailId: string): { entryId: string; nodeIds: Set<string> } | null {
  const tail = workflow.nodes.find((node) => node.id === tailId);
  if (!tail || ['trigger', 'start', 'merge'].includes(tail.category)) return null;
  const nodeIds = new Set<string>();
  const queue = [tailId];
  while (queue.length) {
    const current = queue.shift()!;
    if (nodeIds.has(current)) continue;
    nodeIds.add(current);
    for (const edge of workflow.connections.filter((candidate) => candidate.targetNodeId === current && candidate.sourceNodeId !== iteratorId)) {
      const source = workflow.nodes.find((node) => node.id === edge.sourceNodeId);
      if (!source || ['trigger', 'start'].includes(source.category)) return null;
      queue.push(source.id);
    }
  }
  const entries = [...nodeIds].filter((id) => !workflow.connections.some((edge) => nodeIds.has(edge.sourceNodeId) && edge.targetNodeId === id));
  return entries.length === 1 ? { entryId: entries[0]!, nodeIds } : null;
}

function completionBoundary(workflow: CanonicalWorkflow, iteratorId: string, bodyIds: Set<string>): WorkflowNode | null {
  const iteratorIndex = workflow.nodes.findIndex((node) => node.id === iteratorId);
  const candidates = workflow.nodes.filter((node, index) => index > iteratorIndex
    && !bodyIds.has(node.id)
    && !['trigger', 'start', 'note', 'group', 'merge'].includes(node.category)
    && !workflow.connections.some((edge) => edge.targetNodeId === node.id));
  const requiredAggregators = workflow.nodes.filter((node) => !bodyIds.has(node.id) && node.configuration.conceptualRole === 'item-aggregator');
  if (requiredAggregators.length > 1) return null;
  if (requiredAggregators.length === 1) return candidates.length === 1 && candidates[0]!.id === requiredAggregators[0]!.id ? candidates[0]! : null;
  return candidates.length === 1 ? candidates[0]! : null;
}

function validateExistingTopology(iterator: WorkflowNode, item: WorkflowConnection, completed: WorkflowConnection, loopBack: WorkflowConnection, issues: GraphIssue[]): void {
  if (item.sourcePort !== 'item' || item.targetPort !== 'input' || item.label !== 'Each Item' || item.branchLabel !== null || item.style !== 'loop') {
    warn(issues, 'PROVIDER_ITERATOR_ITEM_SEMANTICS_INVALID', 'Iterator item path has incorrect canonical handles, label, or style.', iterator.id, item.id);
  }
  if (loopBack.targetPort !== 'loop-back' || loopBack.label !== 'Loop Back' || loopBack.branchLabel !== 'LOOP' || loopBack.style !== 'loop') {
    warn(issues, 'PROVIDER_ITERATOR_LOOP_BACK_SEMANTICS_INVALID', 'Iterator loop-back path has incorrect canonical handles, label, or style.', iterator.id, loopBack.id);
  }
  if (completed.sourcePort !== 'done' || completed.targetPort !== 'input' || completed.label !== 'Completed' || completed.branchLabel !== 'DONE' || completed.style !== 'success') {
    warn(issues, 'PROVIDER_ITERATOR_COMPLETION_SEMANTICS_INVALID', 'Iterator completion path has incorrect canonical handles, label, or style.', iterator.id, completed.id);
  }
  if (completed.targetNodeId === item.targetNodeId) warn(issues, 'PROVIDER_ITERATOR_PATHS_CONTRADICT', 'Completed path enters the loop body.', iterator.id, completed.id);
}

function validateReachability(workflow: CanonicalWorkflow, issues: GraphIssue[]): void {
  const nodeIds = new Set(workflow.nodes.map((node) => node.id));
  for (const edge of workflow.connections) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) warn(issues, 'PROVIDER_DANGLING_EDGE', 'A workflow edge references a missing node.', undefined, edge.id);
  }
  const reachable = new Set(workflow.nodes.filter((node) => node.category === 'trigger' || node.category === 'start').map((node) => node.id));
  const queue = [...reachable];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of workflow.connections.filter((candidate) => candidate.sourceNodeId === current)) {
      if (!reachable.has(edge.targetNodeId)) { reachable.add(edge.targetNodeId); queue.push(edge.targetNodeId); }
    }
  }
  for (const node of workflow.nodes.filter((node) => !['trigger', 'start', 'note', 'group'].includes(node.category) && !reachable.has(node.id))) {
    warn(issues, 'PROVIDER_UNREACHABLE_NODE', 'A non-trigger workflow node is unreachable from the workflow entry.', node.id);
  }
}

function isIteratorCandidate(node: WorkflowNode): boolean {
  if (node.category !== 'loop') return false;
  if (node.configuration.conceptualRole === 'collection-iterator') return true;
  return iteratorOperation.test(node.operation?.trim() ?? '');
}
function isItemEdge(edge: WorkflowConnection) { return edge.sourcePort === 'item' || /^each item$/i.test(edge.label); }
function isLoopBackEdge(edge: WorkflowConnection) { return edge.targetPort === 'loop-back' || /^loop back$/i.test(edge.label); }
function isCompletionEdge(edge: WorkflowConnection) { return edge.sourcePort === 'done' || edge.branchLabel === 'DONE' || /^(?:done|completed)$/i.test(edge.label); }
function validLoopBack(edge: WorkflowConnection) { return edge.targetPort === 'loop-back' && edge.label === 'Loop Back' && edge.branchLabel === 'LOOP' && edge.style === 'loop'; }
function validCompletion(edge: WorkflowConnection) { return edge.sourcePort === 'done' && edge.targetPort === 'input' && edge.label === 'Completed' && edge.branchLabel === 'DONE' && edge.style === 'success'; }
function eachItemEdge(sourceNodeId: string, targetNodeId: string): WorkflowConnection {
  return { id: crypto.randomUUID(), sourceNodeId, targetNodeId, sourcePort: 'item', targetPort: 'input', label: 'Each Item', branchLabel: null, condition: null, routeType: 'conditional', style: 'loop', mappings: [] };
}
function completedEdge(sourceNodeId: string, targetNodeId: string): WorkflowConnection {
  return { id: crypto.randomUUID(), sourceNodeId, targetNodeId, sourcePort: 'done', targetPort: 'input', label: 'Completed', branchLabel: 'DONE', condition: null, routeType: 'success', style: 'success', mappings: [] };
}
function warn(issues: GraphIssue[], code: string, message: string, nodeId?: string, connectionId?: string) {
  issues.push({ severity: 'warning', code, message, ...(nodeId ? { nodeId } : {}), ...(connectionId ? { connectionId } : {}) });
}
