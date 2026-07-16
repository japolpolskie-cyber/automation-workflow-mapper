import { z } from 'zod';
import type { CanonicalWorkflow, VisualGraphProjection, WorkflowConnection } from './domain.js';

export const graphIssueSchema = z.object({
  severity: z.enum(['error', 'warning']),
  code: z.string(),
  message: z.string(),
  nodeId: z.string().uuid().optional(),
  connectionId: z.string().uuid().optional()
});
export type GraphIssue = z.infer<typeof graphIssueSchema>;

export interface GraphValidationResult {
  valid: boolean;
  issues: GraphIssue[];
  statistics: { nodes: number; connections: number; branches: number; disconnectedNodes: number };
}

export function validateWorkflowGraph(workflow: CanonicalWorkflow): GraphValidationResult {
  const issues: GraphIssue[] = [];
  const nodeIds = new Set<string>();
  const connectionIds = new Set<string>();
  for (const node of workflow.nodes) {
    if (nodeIds.has(node.id)) issues.push({ severity: 'error', code: 'DUPLICATE_NODE_ID', message: `Node ID ${node.id} is used more than once.`, nodeId: node.id });
    nodeIds.add(node.id);
  }
  for (const connection of workflow.connections) {
    if (connectionIds.has(connection.id)) issues.push({ severity: 'error', code: 'DUPLICATE_CONNECTION_ID', message: `Connection ID ${connection.id} is used more than once.`, connectionId: connection.id });
    connectionIds.add(connection.id);
    if (!nodeIds.has(connection.sourceNodeId)) issues.push({ severity: 'error', code: 'MISSING_SOURCE_NODE', message: 'Connection source does not exist.', connectionId: connection.id });
    if (!nodeIds.has(connection.targetNodeId)) issues.push({ severity: 'error', code: 'MISSING_TARGET_NODE', message: 'Connection destination does not exist.', connectionId: connection.id });
    if (connection.sourceNodeId === connection.targetNodeId) issues.push({ severity: 'error', code: 'SELF_CONNECTION', message: 'A node cannot connect directly to itself.', connectionId: connection.id, nodeId: connection.sourceNodeId });
  }
  if (workflow.nodes.length > 0 && !workflow.nodes.some((node) => node.category === 'trigger' || node.category === 'start')) {
    issues.push({ severity: 'error', code: 'TRIGGER_REQUIRED', message: 'The workflow requires a trigger or start node.' });
  }
  const connected = new Set(workflow.connections.flatMap((connection) => [connection.sourceNodeId, connection.targetNodeId]));
  const disconnected = workflow.nodes.filter((node) => !connected.has(node.id) && !['note', 'group'].includes(node.category));
  for (const node of disconnected) issues.push({ severity: 'warning', code: 'DISCONNECTED_NODE', message: `${node.name} is disconnected.`, nodeId: node.id });
  const outgoingByNode = new Map(workflow.nodes.map((node) => [node.id, workflow.connections.filter((edge) => edge.sourceNodeId === node.id)]));
  const incomingByNode = new Map(workflow.nodes.map((node) => [node.id, workflow.connections.filter((edge) => edge.targetNodeId === node.id)]));
  for (const node of workflow.nodes) {
    const outgoing = outgoingByNode.get(node.id) ?? [];
    if (['condition', 'filter'].includes(node.category)) {
      const decisions = outgoing.filter((edge) => edge.routeType !== 'error');
      if (decisions.length < 2) issues.push({ severity: 'error', code: 'CONDITION_BRANCHES_REQUIRED', message: `${node.name} must have at least two outgoing decision branches.`, nodeId: node.id });
      for (const edge of decisions.filter((item) => !item.label.trim() && !item.branchLabel)) issues.push({ severity: 'error', code: 'BRANCH_LABEL_REQUIRED', message: `Every branch from ${node.name} must have a label.`, nodeId: node.id, connectionId: edge.id });
      const labels = decisions.map((edge) => (edge.branchLabel || edge.label).trim().toUpperCase()).filter(Boolean);
      if (new Set(labels).size !== labels.length) issues.push({ severity: 'error', code: 'OVERLAPPING_BRANCHES', message: `${node.name} has duplicate branch labels.`, nodeId: node.id });
      if (!node.decisionRule) issues.push({ severity: 'error', code: 'DECISION_RULE_REQUIRED', message: `${node.name} must define its decision question, field, operator, and comparison value.`, nodeId: node.id });
    }
    if (node.category === 'merge' && (incomingByNode.get(node.id)?.length ?? 0) < 2) issues.push({ severity: 'error', code: 'MERGE_INPUTS_REQUIRED', message: `${node.name} must combine at least two incoming routes.`, nodeId: node.id });
    if (node.category === 'loop') {
      const labels = outgoing.map((edge) => edge.branchLabel || edge.label.toUpperCase());
      if (!labels.includes('LOOP') || !labels.includes('DONE')) issues.push({ severity: 'error', code: 'LOOP_EXITS_REQUIRED', message: `${node.name} needs labeled LOOP and DONE routes.`, nodeId: node.id });
    }
  }
  for (const branch of workflow.branches) {
    if (!nodeIds.has(branch.sourceNodeId)) issues.push({ severity: 'error', code: 'MISSING_BRANCH_SOURCE', message: `${branch.name} references a missing source node.` });
    if (branch.destinationNodeId === null) issues.push({ severity: 'warning', code: 'BRANCH_DESTINATION_REQUIRED', message: `${branch.name} has no destination.` });
    else if (!nodeIds.has(branch.destinationNodeId)) issues.push({ severity: 'error', code: 'MISSING_BRANCH_DESTINATION', message: `${branch.name} references a missing destination node.` });
  }
  detectUnsupportedCycles(workflow, issues);
  return { valid: !issues.some((issue) => issue.severity === 'error'), issues, statistics: { nodes: workflow.nodes.length, connections: workflow.connections.length, branches: workflow.branches.length, disconnectedNodes: disconnected.length } };
}

function detectUnsupportedCycles(workflow: CanonicalWorkflow, issues: GraphIssue[]): void {
  const adjacency = new Map<string, string[]>();
  for (const connection of workflow.connections) adjacency.set(connection.sourceNodeId, [...(adjacency.get(connection.sourceNodeId) ?? []), connection.targetNodeId]);
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string, path: string[]): void => {
    if (active.has(id)) {
      const cycle = path.slice(path.indexOf(id));
      if (!cycle.some((nodeId) => nodeById.get(nodeId)?.category === 'loop')) issues.push({ severity: 'error', code: 'INVALID_CYCLE', message: 'A circular dependency exists without an explicit loop node.', nodeId: id });
      return;
    }
    if (visited.has(id)) return;
    visited.add(id); active.add(id);
    for (const target of adjacency.get(id) ?? []) visit(target, [...path, target]);
    active.delete(id);
  };
  for (const node of workflow.nodes) visit(node.id, [node.id]);
}

export function projectWorkflowToVisualGraph(workflow: CanonicalWorkflow): VisualGraphProjection {
  const incoming = new Map(workflow.nodes.map((node) => [node.id, 0]));
  for (const connection of workflow.connections) incoming.set(connection.targetNodeId, (incoming.get(connection.targetNodeId) ?? 0) + 1);
  const depth = new Map<string, number>();
  const queue = workflow.nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0).map((node) => node.id);
  for (const id of queue) depth.set(id, 0);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    if (!id) continue;
    for (const connection of workflow.connections.filter((item) => item.sourceNodeId === id)) {
      const nextDepth = (depth.get(id) ?? 0) + 1;
      depth.set(connection.targetNodeId, Math.max(depth.get(connection.targetNodeId) ?? 0, nextDepth));
      const remaining = (incoming.get(connection.targetNodeId) ?? 1) - 1;
      incoming.set(connection.targetNodeId, remaining);
      if (remaining === 0) queue.push(connection.targetNodeId);
    }
  }
  const rows = new Map<number, number>();
  const nodes = workflow.nodes.map((node, index) => {
    const layer = depth.get(node.id) ?? index;
    const row = rows.get(layer) ?? 0; rows.set(layer, row + 1);
    return { id: `visual-${node.id}`, position: { x: layer * 320, y: row * 190 }, data: { domainNodeId: node.id } };
  });
  return { nodes, edges: workflow.connections.map((connection) => ({ id: `visual-${connection.id}`, source: `visual-${connection.sourceNodeId}`, target: `visual-${connection.targetNodeId}`, data: { domainConnectionId: connection.id } })) };
}

export function applyVisualTopology(workflow: CanonicalWorkflow, graph: VisualGraphProjection): CanonicalWorkflow {
  const domainNodeByVisualId = new Map(graph.nodes.map((node) => [node.id, node.data.domainNodeId]));
  const connectionById = new Map(workflow.connections.map((connection) => [connection.id, connection]));
  const connections: WorkflowConnection[] = graph.edges.map((edge) => {
    const existing = connectionById.get(edge.data.domainConnectionId);
    const sourceNodeId = domainNodeByVisualId.get(edge.source);
    const targetNodeId = domainNodeByVisualId.get(edge.target);
    if (!existing || !sourceNodeId || !targetNodeId) throw new Error('Visual graph references unknown canonical workflow elements.');
    return { ...existing, sourceNodeId, targetNodeId };
  });
  return { ...workflow, connections, updatedAt: new Date().toISOString() };
}

export function inferWorkflowConnections(workflow: CanonicalWorkflow): CanonicalWorkflow {
  if (workflow.connections.length || workflow.nodes.length < 2) return workflow;
  const connections: WorkflowConnection[] = [];
  let previous: CanonicalWorkflow['nodes'][number] | null = null;
  for (const node of workflow.nodes) {
    if (node.category === 'trigger' && previous?.category !== 'start') { previous = node; continue; }
    if (previous) connections.push({ id: crypto.randomUUID(), sourceNodeId: previous.id, targetNodeId: node.id, sourcePort: 'output', targetPort: 'input', label: node.category === 'error_handler' ? 'FAILED' : 'SUCCESS', branchLabel: node.category === 'error_handler' ? 'FAILED' : 'SUCCESS', style: node.category === 'error_handler' ? 'failure' : 'success', condition: null, routeType: node.category === 'error_handler' ? 'error' : 'success', mappings: [] });
    previous = node;
  }
  return { ...workflow, connections, warnings: [...workflow.warnings, 'Execution connections were inferred from step order because the AI returned no topology. Review branches and data dependencies before implementation.'], updatedAt: new Date().toISOString() };
}
