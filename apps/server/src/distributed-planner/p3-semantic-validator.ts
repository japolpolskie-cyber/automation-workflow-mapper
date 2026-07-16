import type { P36WorkflowSkeletonInput, P36WorkflowSkeletonOutput, PlannerEdgeRole } from '@awm/shared';
import { semanticRoleDefinitions } from '../planner/semantic-role-model.js';
import type { P3ValidationIssue } from './p3-stage-validator.js';

const issue = (code: string, message: string): P3ValidationIssue => ({ code, message });
const at = <T>(items: T[], index: number) => items[index];

export function validateP37SemanticSkeleton(input: P36WorkflowSkeletonInput, output: P36WorkflowSkeletonOutput): P3ValidationIssue[] {
  const issues: P3ValidationIssue[] = [];
  for (const workflow of output.workflows) {
    const incoming = workflow.nodes.map(() => [] as number[]);
    const outgoing = workflow.nodes.map(() => [] as number[]);
    workflow.edges.forEach((edge, edgeIndex) => {
      outgoing[edge.sourceIndex]?.push(edgeIndex);
      incoming[edge.targetIndex]?.push(edgeIndex);
    });
    workflow.nodes.forEach((node, nodeIndex) => {
      const slot = at(input.roleSlots, node.roleSlotIndex);
      if (!slot) {
        issues.push(issue('UNKNOWN_ROLE_SLOT', `Node ${nodeIndex} references role slot ${node.roleSlotIndex}, which does not exist.`));
        return;
      }
      if (slot.role !== node.semanticRole) issues.push(issue('ROLE_SLOT_MISMATCH', `Node ${nodeIndex} declares ${node.semanticRole} but its deterministic slot requires ${slot.role}.`));
      if (!slot.allowedCanonicalFunctionSymbols.includes(node.canonicalFunctionSymbol)) issues.push(issue('CANONICAL_FUNCTION_ROLE_MISMATCH', `Node ${nodeIndex} selected a valid canonical symbol that is not allowed for ${slot.role}.`));
      const roleRelatedClarifications = new Set(input.roleSlots.flatMap((item) => item.clarificationSymbols));
      for (const clarificationSymbol of node.blockedByClarificationSymbols) if (roleRelatedClarifications.has(clarificationSymbol) && !slot.clarificationSymbols.includes(clarificationSymbol)) {
        issues.push(issue('CLARIFICATION_ROLE_MISMATCH', `Clarification symbol ${clarificationSymbol} is not related to ${slot.role} node ${nodeIndex}.`));
      }
      if (node.inputShape !== slot.inputShape && slot.inputShape !== 'unknown') issues.push(issue('ROLE_INPUT_SHAPE_MISMATCH', `Node ${nodeIndex} requires ${slot.inputShape} input, not ${node.inputShape}.`));
      if (node.outputShape !== slot.outputShape && slot.outputShape !== 'unknown') issues.push(issue('ROLE_OUTPUT_SHAPE_MISMATCH', `Node ${nodeIndex} must produce ${slot.outputShape}, not ${node.outputShape}.`));
      const definition = semanticRoleDefinitions[slot.role];
      const inCount = incoming[nodeIndex]?.length ?? 0; const outIndexes = outgoing[nodeIndex] ?? [];
      if (inCount < definition.minimumIncomingEdges) issues.push(issue('INSUFFICIENT_INCOMING_EDGES', `${slot.role} node ${nodeIndex} requires at least ${definition.minimumIncomingEdges} incoming edge(s).`));
      if (slot.role === 'workflow-trigger' && inCount > 0) issues.push(issue('TRIGGER_HAS_INCOMING_EDGE', `Trigger node ${nodeIndex} cannot have incoming workflow edges.`));
      if (definition.mayTerminate && outIndexes.length > 0) issues.push(issue('END_HAS_OUTGOING_EDGE', `Terminal node ${nodeIndex} cannot have outgoing business edges.`));
      for (const edgeIndex of outIndexes) {
        const edgeRole = workflow.edges[edgeIndex]!.role;
        if (!definition.allowedEdgeRoles.includes(edgeRole)) issues.push(issue('EDGE_ROLE_NOT_ALLOWED', `${slot.role} node ${nodeIndex} cannot emit a ${edgeRole} edge.`));
      }
      if (slot.role === 'collection-iterator' && node.inputShape !== 'collection') issues.push(issue('ITERATOR_REQUIRES_COLLECTION', `Iterator node ${nodeIndex} cannot process a proven single item.`));
      if (slot.role === 'delay-boundary' && !hasDelayBoundary(node.title, node.unresolvedGroundingRequirements)) issues.push(issue('DELAY_BOUNDARY_MISSING', `Delay node ${nodeIndex} requires a duration, date, event, or blocking clarification.`));
      if (slot.role === 'business-loop' && workflow.retries.some((retry) => retry.nodeIndex === nodeIndex)) issues.push(issue('BUSINESS_LOOP_AS_RETRY', `Business repetition at node ${nodeIndex} cannot use a technical retry boundary.`));
      if (slot.role === 'technical-retry' && workflow.loops.some((loop) => loop.nodeIndex === nodeIndex)) issues.push(issue('RETRY_AS_BUSINESS_LOOP', `Technical retry node ${nodeIndex} cannot be represented as a business loop.`));
    });

    for (const binary of workflow.binaryConditions) {
      const node = at(workflow.nodes, binary.nodeIndex); const trueEdge = at(workflow.edges, binary.trueEdgeIndex); const falseEdge = at(workflow.edges, binary.falseEdgeIndex);
      if (node?.semanticRole !== 'binary-decision') issues.push(issue('BINARY_ROLE_MISMATCH', `Binary topology at node ${binary.nodeIndex} must use the binary-decision role.`));
      if (!trueEdge || !falseEdge || trueEdge.role !== 'true' || falseEdge.role !== 'false') issues.push(issue('BINARY_BRANCH_INCOMPLETE', `Binary node ${binary.nodeIndex} requires explicit TRUE and FALSE edges.`));
      if (trueEdge?.targetIndex === falseEdge?.targetIndex) issues.push(issue('DUPLICATE_BINARY_DESTINATION', `Binary node ${binary.nodeIndex} must have distinct business outcomes.`));
    }
    for (const router of workflow.routers) {
      if (workflow.nodes[router.nodeIndex]?.semanticRole !== 'multi-route-decision') issues.push(issue('ROUTER_ROLE_MISMATCH', `Router topology at node ${router.nodeIndex} must use the multi-route-decision role.`));
      if (router.routes.length < 3) issues.push(issue('ROUTER_REQUIRES_MULTIPLE_ROUTES', `Router node ${router.nodeIndex} requires at least three meaningful routes; use a binary condition for two.`));
      if (new Set(router.routes.map((route) => route.destinationNodeIndex)).size !== router.routes.length) issues.push(issue('DUPLICATE_ROUTE_DESTINATION', `Router node ${router.nodeIndex} contains duplicate destinations.`));
    }
    for (const merge of workflow.merges) {
      if (workflow.nodes[merge.nodeIndex]?.semanticRole !== 'branch-merge') issues.push(issue('MERGE_ROLE_MISMATCH', `Merge topology at node ${merge.nodeIndex} must use the branch-merge role.`));
      const sources = merge.incomingEdgeIndexes.map((index) => workflow.edges[index]?.sourceIndex).filter((value) => value !== undefined);
      if (new Set(sources).size < 2) issues.push(issue('MERGE_REQUIRES_DISTINCT_BRANCHES', `Merge node ${merge.nodeIndex} requires at least two distinct incoming branches.`));
    }
    for (const aggregator of workflow.aggregators) {
      if (workflow.nodes[aggregator.nodeIndex]?.semanticRole !== 'item-aggregator') issues.push(issue('AGGREGATOR_ROLE_MISMATCH', `Aggregator topology at node ${aggregator.nodeIndex} must use the item-aggregator role.`));
      if (!aggregator.aggregationMethod.trim()) issues.push(issue('AGGREGATION_METHOD_MISSING', `Aggregator node ${aggregator.nodeIndex} requires an aggregation method placeholder.`));
    }
    for (const loop of workflow.loops) {
      const edgeRoles = new Set((outgoing[loop.nodeIndex] ?? []).map((index) => workflow.edges[index]!.role));
      const hasClarification = workflow.nodes[loop.nodeIndex]?.blockedByClarificationSymbols.length || workflow.blockingClarificationSymbols.length;
      if (!edgeRoles.has('loop-back') || !edgeRoles.has('loop-exit')) issues.push(issue('LOOP_TOPOLOGY_INCOMPLETE', `Loop node ${loop.nodeIndex} requires loop-back and exit edges.`));
      if (!loop.stopBoundary.trim() && !hasClarification) issues.push(issue('LOOP_STOP_BOUNDARY_MISSING', `Loop node ${loop.nodeIndex} needs a stop boundary or blocking clarification.`));
    }
    for (const retry of workflow.retries) {
      const retryEdge = workflow.edges[retry.retryEdgeIndex]; const exhaustedEdge = workflow.edges[retry.exhaustedEdgeIndex];
      if (workflow.nodes[retry.nodeIndex]?.semanticRole !== 'technical-retry') issues.push(issue('RETRY_ROLE_MISMATCH', `Retry topology at node ${retry.nodeIndex} must use the technical-retry role.`));
      if (retryEdge?.role !== 'retry' || exhaustedEdge?.role !== 'retry-exhausted') issues.push(issue('RETRY_TOPOLOGY_INCOMPLETE', `Retry node ${retry.nodeIndex} requires retry and final-failure routes.`));
      if (retry.attemptLimit === null && retry.missingLimitClarificationSymbol === null) issues.push(issue('RETRY_LIMIT_UNRESOLVED', `Retry node ${retry.nodeIndex} requires an attempt limit or explicit missing-limit clarification.`));
    }
    const describedSpecialNodes = new Set([
      ...workflow.binaryConditions.map((item) => item.nodeIndex), ...workflow.routers.map((item) => item.nodeIndex),
      ...workflow.loops.map((item) => item.nodeIndex), ...workflow.merges.map((item) => item.nodeIndex),
      ...workflow.aggregators.map((item) => item.nodeIndex), ...workflow.retries.map((item) => item.nodeIndex),
    ]);
    workflow.nodes.forEach((node, index) => {
      if (['binary-decision', 'multi-route-decision', 'business-loop', 'branch-merge', 'item-aggregator', 'technical-retry'].includes(node.semanticRole) && !describedSpecialNodes.has(index)) {
        issues.push(issue('INCOMPLETE_ROLE_TOPOLOGY', `${node.semanticRole} node ${index} is missing its required topology declaration.`));
      }
    });
  }
  return issues;
}

function hasDelayBoundary(title: string, requirements: string[]): boolean {
  const text = `${title} ${requirements.join(' ')}`.toLowerCase();
  return /\b(\d+\s*(minute|hour|day|week)|until|at\s+\d|date|time|event|clarif)/.test(text);
}

export const semanticValidationIssueCodes = [
  'UNKNOWN_ROLE_SLOT', 'ROLE_SLOT_MISMATCH', 'CANONICAL_FUNCTION_ROLE_MISMATCH',
  'ROLE_INPUT_SHAPE_MISMATCH', 'ROLE_OUTPUT_SHAPE_MISMATCH', 'INSUFFICIENT_INCOMING_EDGES',
  'TRIGGER_HAS_INCOMING_EDGE', 'END_HAS_OUTGOING_EDGE', 'EDGE_ROLE_NOT_ALLOWED',
  'ITERATOR_REQUIRES_COLLECTION', 'DELAY_BOUNDARY_MISSING', 'BUSINESS_LOOP_AS_RETRY',
  'RETRY_AS_BUSINESS_LOOP', 'BINARY_ROLE_MISMATCH', 'BINARY_BRANCH_INCOMPLETE',
  'DUPLICATE_BINARY_DESTINATION', 'ROUTER_ROLE_MISMATCH', 'ROUTER_REQUIRES_MULTIPLE_ROUTES',
  'DUPLICATE_ROUTE_DESTINATION', 'MERGE_ROLE_MISMATCH', 'MERGE_REQUIRES_DISTINCT_BRANCHES',
  'AGGREGATOR_ROLE_MISMATCH', 'AGGREGATION_METHOD_MISSING', 'LOOP_TOPOLOGY_INCOMPLETE',
  'LOOP_STOP_BOUNDARY_MISSING', 'RETRY_ROLE_MISMATCH', 'RETRY_TOPOLOGY_INCOMPLETE',
  'RETRY_LIMIT_UNRESOLVED', 'INCOMPLETE_ROLE_TOPOLOGY',
  'CLARIFICATION_ROLE_MISMATCH',
] as const;

export function isBusinessEdgeRole(role: PlannerEdgeRole): boolean {
  return !['retry', 'retry-exhausted'].includes(role);
}
