import type { P3BusinessIntentInput, P3BusinessIntentOutput, P3WorkflowSkeletonInput, P3WorkflowSkeletonOutput } from '@awm/shared';

export interface P3ValidationIssue { code: string; message: string }
const unique = (values: string[]) => new Set(values).size === values.length;

export function validateP3Intent(input: P3BusinessIntentInput, output: P3BusinessIntentOutput): P3ValidationIssue[] {
  const issues: P3ValidationIssue[] = [];
  const facts = new Set(input.facts.map((item) => item.id)); const knowledge = new Set(input.patterns.map((item) => item.id));
  for (const id of output.factIds) if (!facts.has(id)) issues.push({ code: 'INVALID_FACT_REFERENCE', message: `Intent references unknown fact ${id}.` });
  for (const id of output.knowledgeIds) if (!knowledge.has(id)) issues.push({ code: 'INVALID_KNOWLEDGE_REFERENCE', message: `Intent references unknown knowledge ${id}.` });
  const required = input.clarifications.map((item) => item.id);
  const preserved = new Set(output.unresolvedQuestions.map((item) => item.clarificationId));
  for (const id of required) if (!preserved.has(id)) issues.push({ code: 'DROPPED_CLARIFICATION', message: `Intent dropped clarification ${id}.` });
  const serialized = JSON.stringify(output).toLowerCase();
  if (/"operation(ref|id)"|\.create-|\.send-|\.update-/.test(serialized)) issues.push({ code: 'OPERATION_GROUNDING_FORBIDDEN', message: 'Stage A must not ground application operations.' });
  if (/confidence|coverage|reliability|evidenceweight|benchmarkscore|qametric/.test(serialized)) issues.push({ code: 'OBSERVABILITY_LEAK', message: 'Stage A contains observability-only metrics.' });
  if (!unique(output.workflowBoundaryCandidates.map((item) => item.temporaryId))) issues.push({ code: 'DUPLICATE_BOUNDARY_ID', message: 'Workflow boundary IDs must be unique.' });
  return issues;
}

export function validateP3Skeleton(input: P3WorkflowSkeletonInput, output: P3WorkflowSkeletonOutput): P3ValidationIssue[] {
  const issues: P3ValidationIssue[] = [];
  const allowedFunctions = new Set(input.allowedCanonicalFunctions); const facts = new Set(input.facts.map((item) => item.id));
  const evidence = new Set(input.evidence.map((item) => item.id)); const knowledge = new Set(input.patterns.map((item) => item.id));
  const clarifications = new Set(input.clarifications.map((item) => item.id)); const boundaries = new Set(input.intent.workflowBoundaryCandidates.map((item) => item.temporaryId));
  for (const workflow of output.workflows) {
    if (!boundaries.has(workflow.boundaryCandidateId)) issues.push({ code: 'INVALID_BOUNDARY_REFERENCE', message: `${workflow.temporaryWorkflowId} references an unknown intent boundary.` });
    const nodes = new Map(workflow.nodes.map((item) => [item.key, item])); const edges = new Map(workflow.edges.map((item) => [item.key, item]));
    if (!nodes.has(workflow.entryNodeKey)) issues.push({ code: 'MISSING_ENTRY_NODE', message: `${workflow.temporaryWorkflowId} entry node is missing.` });
    for (const key of workflow.exitNodeKeys) if (!nodes.has(key)) issues.push({ code: 'MISSING_EXIT_NODE', message: `${workflow.temporaryWorkflowId} exit node ${key} is missing.` });
    for (const node of workflow.nodes) {
      if (!allowedFunctions.has(node.canonicalFunctionId)) issues.push({ code: 'INVALID_CANONICAL_FUNCTION', message: `${node.key} uses unsupported canonical function ${node.canonicalFunctionId}.` });
      for (const id of node.factIds) if (!facts.has(id)) issues.push({ code: 'INVALID_FACT_REFERENCE', message: `${node.key} references unknown fact ${id}.` });
      for (const id of node.knowledgeIds) if (!knowledge.has(id)) issues.push({ code: 'INVALID_KNOWLEDGE_REFERENCE', message: `${node.key} references unknown knowledge ${id}.` });
      for (const id of node.evidenceIds) if (!evidence.has(id)) issues.push({ code: 'INVALID_EVIDENCE_REFERENCE', message: `${node.key} references unknown evidence ${id}.` });
      for (const id of node.blockedByClarificationIds) if (!clarifications.has(id)) issues.push({ code: 'INVALID_CLARIFICATION_REFERENCE', message: `${node.key} references unknown clarification ${id}.` });
    }
    for (const edge of workflow.edges) {
      if (!nodes.has(edge.sourceKey) || !nodes.has(edge.targetKey)) issues.push({ code: 'DANGLING_EDGE', message: `${edge.key} has a missing endpoint.` });
      for (const id of edge.evidenceIds) if (!evidence.has(id)) issues.push({ code: 'INVALID_EVIDENCE_REFERENCE', message: `${edge.key} references unknown evidence ${id}.` });
    }
    for (const condition of workflow.binaryConditions) {
      const trueEdge = edges.get(condition.trueEdgeKey); const falseEdge = edges.get(condition.falseEdgeKey);
      if (!nodes.has(condition.nodeKey) || !trueEdge || !falseEdge || trueEdge.sourceKey !== condition.nodeKey || falseEdge.sourceKey !== condition.nodeKey) issues.push({ code: 'INVALID_BINARY_TOPOLOGY', message: `${condition.nodeKey} must own valid TRUE and FALSE edges.` });
      if (trueEdge?.label.toUpperCase() !== 'TRUE' || falseEdge?.label.toUpperCase() !== 'FALSE') issues.push({ code: 'INVALID_BINARY_LABELS', message: `${condition.nodeKey} requires TRUE and FALSE labels.` });
    }
    for (const router of workflow.routers) for (const route of router.routes) {
      const edge = edges.get(route.edgeKey); if (!edge || edge.sourceKey !== router.nodeKey || edge.targetKey !== route.destinationKey) issues.push({ code: 'INVALID_ROUTE', message: `${router.nodeKey} route ${route.label} is inconsistent.` });
    }
    for (const loop of workflow.loops) if (![loop.nodeKey, loop.bodyEntryKey, loop.bodyExitKey].every((key) => nodes.has(key)) || !edges.has(loop.entryEdgeKey) || !edges.has(loop.exitEdgeKey)) issues.push({ code: 'INVALID_LOOP_BOUNDARY', message: `${loop.nodeKey} loop boundary is incomplete.` });
    for (const merge of workflow.merges) if (!nodes.has(merge.nodeKey) || merge.incomingEdgeKeys.some((key) => !edges.has(key)) || !edges.has(merge.continuationEdgeKey)) issues.push({ code: 'INVALID_MERGE', message: `${merge.nodeKey} merge boundary is incomplete.` });
    const visible = new Set([...workflow.blockingClarificationIds, ...workflow.nodes.flatMap((item) => item.blockedByClarificationIds)]);
    for (const id of clarifications) if (!visible.has(id)) issues.push({ code: 'DROPPED_CLARIFICATION', message: `${workflow.temporaryWorkflowId} dropped clarification ${id}.` });
  }
  const serialized = JSON.stringify(output).toLowerCase();
  if (/"operation(ref|id)"|\.create-|\.send-|\.update-/.test(serialized)) issues.push({ code: 'OPERATION_GROUNDING_FORBIDDEN', message: 'Stage B must not ground application operations.' });
  if (/confidence|coverage|reliability|evidenceweight|benchmarkscore|qametric/.test(serialized)) issues.push({ code: 'OBSERVABILITY_LEAK', message: 'Stage B contains observability-only metrics.' });
  return issues;
}
