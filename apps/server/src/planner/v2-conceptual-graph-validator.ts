import type { PlannerEdgeRole, PlannerSemanticRole, V22ConceptualGraph, V22ValidationIssue } from '@awm/shared';

const allowedOutgoing: Partial<Record<PlannerSemanticRole, ReadonlySet<PlannerEdgeRole>>> = {
  'workflow-trigger': new Set(['flow', 'continuation']),
  'parallel-split': new Set(['parallel-branch']),
  'conditional-parallel-routing': new Set(['conditional-branch']),
  'merge-all': new Set(['continuation']),
  'merge-any': new Set(['continuation']),
  'event-wait': new Set(['resume', 'timeout']),
  'delay-boundary': new Set(['resume', 'timeout', 'continuation']),
  'collection-iterator': new Set(['item', 'iteration-complete']),
  'item-aggregator': new Set(['continuation']),
  'loop-until': new Set(['loop-entry', 'loop-exit']),
  'technical-retry': new Set(['retry', 'retry-exhausted']),
  'error-handler': new Set(['handled', 'continuation', 'flow']),
  'sub-workflow': new Set(['subworkflow-return']),
  'meaningful-end': new Set(),
};

export function validateV22ConceptualGraph(graph: V22ConceptualGraph): V22ValidationIssue[] {
  const issues: V22ValidationIssue[] = [];
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map(graph.nodes.map((node) => [node.id, graph.edges.filter((edge) => edge.target === node.id)]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, graph.edges.filter((edge) => edge.source === node.id)]));
  const issue = (code: string, message: string, nodeId: string | null = null, edgeId: string | null = null) => issues.push({ code, message, nodeId, edgeId });

  if (!nodes.has(graph.entryNodeId)) issue('V22_INVALID_ENTRY', `Entry node ${graph.entryNodeId} does not exist.`);
  if (new Set(graph.nodes.map((node) => node.id)).size !== graph.nodes.length) issue('V22_DUPLICATE_NODE', 'Conceptual node IDs must be unique.');
  if (new Set(graph.edges.map((edge) => edge.id)).size !== graph.edges.length) issue('V22_DUPLICATE_EDGE', 'Conceptual edge IDs must be unique.');

  for (const edge of graph.edges) {
    const source = nodes.get(edge.source);
    if (!source || !nodes.has(edge.target)) {
      issue('V22_DANGLING_EDGE', `${edge.id} has an unknown source or target.`, null, edge.id);
      continue;
    }
    const allowed = allowedOutgoing[source.role];
    if (allowed && !allowed.has(edge.role)) issue('V22_INVALID_SEMANTIC_EDGE', `${source.role} cannot emit ${edge.role}.`, source.id, edge.id);
  }

  const reachable = new Set<string>([graph.entryNodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of graph.edges) {
      if (reachable.has(edge.source) && !reachable.has(edge.target)) {
        reachable.add(edge.target);
        changed = true;
      }
    }
  }
  for (const node of graph.nodes) if (!reachable.has(node.id)) issue('V22_UNREACHABLE_NODE', `${node.title} is not reachable from the entry.`, node.id);

  for (const node of graph.nodes) {
    const inputs = incoming.get(node.id) ?? [];
    const outputs = outgoing.get(node.id) ?? [];
    if ((node.role === 'merge-all' || node.role === 'merge-any') && inputs.filter((edge) => edge.role === 'merge-input').length < 2) {
      issue('V22_MERGE_INPUTS_REQUIRED', `${node.title} requires at least two merge inputs.`, node.id);
    }
    if (node.role === 'conditional-parallel-routing') {
      const branches = outputs.filter((edge) => edge.role === 'conditional-branch');
      if (branches.length < 2) issue('V22_PARALLEL_BRANCHES_REQUIRED', `${node.title} requires at least two conditional branches.`, node.id);
      if (!thisReachesRole(graph, node.id, 'merge-all')) issue('V22_PARALLEL_SYNCHRONIZATION_REQUIRED', `${node.title} must synchronize at a merge-all node.`, node.id);
    }
    if (node.role === 'parallel-split' && outputs.filter((edge) => edge.role === 'parallel-branch').length < 2) {
      issue('V22_PARALLEL_BRANCHES_REQUIRED', `${node.title} requires at least two parallel branches.`, node.id);
    }
    if (node.role === 'event-wait' || node.role === 'delay-boundary') {
      if (!node.wait?.resumeCondition && !node.wait?.timeoutPolicy) issue('V22_WAIT_RESUME_REQUIRED', `${node.title} requires a resume condition or timeout policy.`, node.id);
      if (!outputs.some((edge) => edge.role === 'resume' || edge.role === 'timeout')) issue('V22_WAIT_EDGE_REQUIRED', `${node.title} requires a resume or timeout edge.`, node.id);
      if (node.role === 'event-wait' && !node.wait?.correlationIdentifier) issue('V22_EVENT_CORRELATION_REQUIRED', `${node.title} requires a stable correlation identifier.`, node.id);
    }
    if (node.role === 'collection-iterator') {
      if (!node.collectionSource) issue('V22_ITERATOR_SOURCE_REQUIRED', `${node.title} requires a collection source.`, node.id);
      if (!outputs.some((edge) => edge.role === 'item')) issue('V22_ITERATOR_ITEM_PATH_REQUIRED', `${node.title} requires a current-item path.`, node.id);
    }
    if (node.role === 'item-aggregator' && !inputs.some((edge) => edge.role === 'item-result')) {
      issue('V22_AGGREGATOR_RESULTS_REQUIRED', `${node.title} requires upstream item results.`, node.id);
    }
    if (node.role === 'loop-until') {
      if (!inputs.some((edge) => edge.role === 'loop-back')) issue('V22_LOOP_BACK_REQUIRED', `${node.title} requires an explicit loop-back path.`, node.id);
      if (!outputs.some((edge) => edge.role === 'loop-exit')) issue('V22_LOOP_EXIT_REQUIRED', `${node.title} requires an explicit exit path.`, node.id);
    }
    if (node.role === 'technical-retry') {
      if (!node.retry?.maximumAttempts || node.retry.maximumAttempts < 1) issue('V22_RETRY_BOUND_REQUIRED', `${node.title} requires a bounded attempt limit.`, node.id);
      if (!outputs.some((edge) => edge.role === 'retry') || !outputs.some((edge) => edge.role === 'retry-exhausted')) issue('V22_RETRY_PATHS_REQUIRED', `${node.title} requires retry and exhausted paths.`, node.id);
    }
    if (node.role === 'meaningful-end') {
      if (!node.terminalOutcome) issue('V22_TERMINAL_OUTCOME_REQUIRED', `${node.title} requires a business outcome.`, node.id);
      if (outputs.length) issue('V22_TERMINAL_HAS_OUTPUT', `${node.title} cannot have outgoing edges.`, node.id);
    }
    if (!node.sourceReferences.length) issue('V22_NODE_TRACEABILITY_REQUIRED', `${node.title} has no source requirement reference.`, node.id);
  }
  for (const terminalId of graph.terminalNodeIds) {
    const terminal = nodes.get(terminalId);
    if (!terminal || terminal.role !== 'meaningful-end') issue('V22_INVALID_TERMINAL', `${terminalId} is not a meaningful terminal node.`, terminalId);
  }
  return issues;
}

function thisReachesRole(graph: V22ConceptualGraph, sourceId: string, role: PlannerSemanticRole): boolean {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const visited = new Set([sourceId]);
  const queue = [sourceId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of graph.edges.filter((candidate) => candidate.source === current)) {
      if (nodes.get(edge.target)?.role === role) return true;
      if (!visited.has(edge.target)) {
        visited.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  return false;
}
