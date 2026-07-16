import type { PlannerContext, StructuredWorkflowPlan } from '@awm/shared';

export interface PlannerGraphIssue { code: string; message: string }

export function validatePlannerGraph(plan: StructuredWorkflowPlan, context: PlannerContext): PlannerGraphIssue[] {
  const issues: PlannerGraphIssue[] = [];
  const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
  const edges = new Map(plan.edges.map((edge) => [edge.id, edge]));
  const facts = new Set(context.facts.map((item) => item.id)); const patterns = new Set(context.patterns.map((item) => item.id));
  const knowledge = new Set(context.knowledge.map((item) => item.id)); const capabilities = new Set(context.capabilities.map((item) => item.id));
  const evidence = new Set(context.evidence.map((item) => item.id)); const clarifications = new Set(context.clarifications.map((item) => item.id));
  if (!nodes.has(plan.entryNodeId)) issues.push({ code: 'INVALID_ENTRY', message: `Entry node ${plan.entryNodeId} does not exist.` });
  if (new Set(plan.nodes.map((item) => item.id)).size !== plan.nodes.length) issues.push({ code: 'DUPLICATE_NODE', message: 'Planner node IDs must be unique.' });
  if (new Set(plan.edges.map((item) => item.id)).size !== plan.edges.length) issues.push({ code: 'DUPLICATE_EDGE', message: 'Planner edge IDs must be unique.' });
  for (const node of plan.nodes) {
    if (node.factIds.length + node.patternIds.length + node.knowledgeIds.length + node.capabilityIds.length === 0) issues.push({ code: 'UNGROUNDED_NODE', message: `${node.id} has no fact, pattern, knowledge, or capability references.` });
    for (const id of node.factIds) if (!facts.has(id)) issues.push({ code: 'UNKNOWN_FACT', message: `${node.id} references unknown fact ${id}.` });
    for (const id of node.patternIds) if (!patterns.has(id)) issues.push({ code: 'UNKNOWN_PATTERN', message: `${node.id} references unknown pattern ${id}.` });
    for (const id of node.knowledgeIds) if (!knowledge.has(id)) issues.push({ code: 'UNKNOWN_KNOWLEDGE', message: `${node.id} references unknown knowledge ${id}.` });
    for (const id of node.capabilityIds) if (!capabilities.has(id)) issues.push({ code: 'UNKNOWN_CAPABILITY', message: `${node.id} references unknown capability ${id}.` });
    for (const id of node.blockedByClarificationIds) if (!clarifications.has(id)) issues.push({ code: 'UNKNOWN_CLARIFICATION', message: `${node.id} references unknown clarification ${id}.` });
    const operation = node.operationRef ? context.knowledge.find((item) => item.id === node.operationRef && item.kind === 'operation') : undefined;
    if (node.operationRef && operation?.canonicalFunctionId !== node.canonicalFunctionId) issues.push({ code: 'OPERATION_FUNCTION_MISMATCH', message: `${node.operationRef} does not implement ${node.canonicalFunctionId}.` });
    if (operation?.applicationId && node.applicationRef !== operation.applicationId) issues.push({ code: 'OPERATION_APPLICATION_MISMATCH', message: `${node.operationRef} does not belong to ${node.applicationRef}.` });
    if (node.knowledgeIds.some((id) => context.knowledge.find((item) => item.id === id)?.limitations.length) && node.limitationAcknowledgements.length === 0) issues.push({ code: 'UNACKNOWLEDGED_LIMITATION', message: `${node.id} uses limited knowledge without acknowledging the limitation.` });
  }
  const reachable = new Set<string>([plan.entryNodeId]); let changed = true;
  while (changed) { changed = false; for (const edge of plan.edges) if (reachable.has(edge.source) && !reachable.has(edge.target)) { reachable.add(edge.target); changed = true; } }
  for (const node of plan.nodes) if (!reachable.has(node.id)) issues.push({ code: 'UNREACHABLE_NODE', message: `${node.id} is not reachable from the entry node.` });
  for (const node of plan.nodes.filter((item) => item.canonicalFunctionId === 'binary-condition')) if (!plan.binaryConditions.some((item) => item.nodeId === node.id)) issues.push({ code: 'MISSING_BINARY_BOUNDARY', message: `${node.id} lacks explicit TRUE/FALSE edges.` });
  for (const node of plan.nodes.filter((item) => item.canonicalFunctionId === 'multi-route-decision')) if (!plan.routers.some((item) => item.nodeId === node.id)) issues.push({ code: 'MISSING_ROUTER_BOUNDARY', message: `${node.id} lacks explicit routes.` });
  for (const node of plan.nodes.filter((item) => item.canonicalFunctionId === 'merge')) if (!plan.merges.some((item) => item.nodeId === node.id)) issues.push({ code: 'MISSING_MERGE_BOUNDARY', message: `${node.id} lacks explicit merge semantics.` });
  for (const node of plan.nodes.filter((item) => item.canonicalFunctionId === 'loop')) if (!plan.loops.some((item) => item.nodeId === node.id)) issues.push({ code: 'MISSING_LOOP_BOUNDARY', message: `${node.id} lacks explicit loop boundaries.` });
  for (const node of plan.nodes.filter((item) => item.canonicalFunctionId === 'retry')) if (!plan.retries.some((item) => item.nodeId === node.id)) issues.push({ code: 'MISSING_RETRY_BOUNDARY', message: `${node.id} lacks explicit retry boundaries.` });
  for (const edge of plan.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) issues.push({ code: 'DANGLING_EDGE', message: `${edge.id} has an unknown source or target.` });
    for (const id of edge.evidenceIds) if (!evidence.has(id)) issues.push({ code: 'UNKNOWN_EDGE_EVIDENCE', message: `${edge.id} references unknown evidence ${id}.` });
  }
  for (const condition of plan.binaryConditions) {
    const trueEdge = edges.get(condition.trueEdgeId); const falseEdge = edges.get(condition.falseEdgeId);
    if (!nodes.has(condition.nodeId) || trueEdge?.source !== condition.nodeId || falseEdge?.source !== condition.nodeId) issues.push({ code: 'INVALID_BINARY_EDGES', message: `${condition.nodeId} must own its TRUE and FALSE edges.` });
    if (trueEdge?.label.toUpperCase() !== 'TRUE' || falseEdge?.label.toUpperCase() !== 'FALSE') issues.push({ code: 'INVALID_BINARY_LABELS', message: `${condition.nodeId} must expose TRUE and FALSE labels.` });
  }
  for (const router of plan.routers) for (const route of router.routes) { const edge = edges.get(route.edgeId); if (edge?.source !== router.nodeId || edge.target !== route.destination) issues.push({ code: 'INVALID_ROUTE', message: `${route.edgeId} does not implement route ${route.label}.` }); }
  for (const merge of plan.merges) {
    if (!merge.incomingBranches.every((id) => edges.get(id)?.target === merge.nodeId)) issues.push({ code: 'INVALID_MERGE_INPUT', message: `${merge.nodeId} has invalid incoming branches.` });
    if (edges.get(merge.continuationEdgeId)?.source !== merge.nodeId) issues.push({ code: 'INVALID_MERGE_CONTINUATION', message: `${merge.nodeId} has an invalid continuation.` });
  }
  for (const loop of plan.loops) {
    if (edges.get(loop.entryEdgeId)?.target !== loop.nodeId || edges.get(loop.exitEdgeId)?.source !== loop.nodeId || !nodes.has(loop.bodyEntryNodeId) || !nodes.has(loop.bodyExitNodeId)) issues.push({ code: 'INVALID_LOOP_BOUNDARY', message: `${loop.nodeId} has incomplete loop boundaries.` });
  }
  for (const retry of plan.retries) {
    if (!nodes.has(retry.nodeId) || !nodes.has(retry.targetNodeId) || edges.get(retry.failureEdgeId)?.source !== retry.nodeId) issues.push({ code: 'INVALID_RETRY_BOUNDARY', message: `${retry.nodeId} has incomplete retry boundaries.` });
    if (plan.loops.some((loop) => loop.nodeId === retry.nodeId)) issues.push({ code: 'RETRY_LOOP_COLLISION', message: `${retry.nodeId} cannot be both a retry and a business loop.` });
  }
  for (const id of plan.blockedByClarificationIds) if (!clarifications.has(id)) issues.push({ code: 'UNKNOWN_BLOCKER', message: `Unknown planning blocker ${id}.` });
  return issues;
}
