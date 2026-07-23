import { z } from 'zod';
import type { CanonicalWorkflow, VisualGraphProjection, WorkflowConnection } from './domain.js';
import { aiAttachmentPortFor, isAiAttachmentConnection, isAiAttachmentNode, isN8nAiAgent } from './ai-agent-attachments.js';

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
    if (isAiAttachmentConnection(connection)) {
      const source = workflow.nodes.find((node) => node.id === connection.sourceNodeId);
      const target = workflow.nodes.find((node) => node.id === connection.targetNodeId);
      if (!source || !isAiAttachmentNode(source)) issues.push({ severity: 'error', code: 'INVALID_ATTACHMENT_SOURCE', message: 'AI attachment connections must start at an attachment card.', connectionId: connection.id });
      if (!target || !isN8nAiAgent(target) || workflow.targetPlatform !== 'n8n') issues.push({ severity: 'error', code: 'ATTACHMENT_PLATFORM_MISMATCH', message: 'AI attachments can connect only to an n8n AI Agent.', connectionId: connection.id });
      if (source?.attachmentType && connection.connectionKind !== aiAttachmentPortFor(source.attachmentType)) issues.push({ severity: 'error', code: 'INCOMPATIBLE_ATTACHMENT_TYPE', message: 'The attachment type does not match the AI Agent port.', connectionId: connection.id, nodeId: source.id });
      if (connection.targetPort !== connection.connectionKind) issues.push({ severity: 'error', code: 'INVALID_ATTACHMENT_PORT', message: 'The attachment is connected to an incompatible AI Agent port.', connectionId: connection.id });
    }
  }
  if (workflow.nodes.length > 0 && !workflow.nodes.some((node) => node.category === 'trigger' || node.category === 'start')) {
    issues.push({ severity: 'error', code: 'TRIGGER_REQUIRED', message: 'The workflow requires a trigger or start node.' });
  }
  const executionConnections = workflow.connections.filter((connection) => !isAiAttachmentConnection(connection));
  const connected = new Set(executionConnections.flatMap((connection) => [connection.sourceNodeId, connection.targetNodeId]));
  const disconnected = workflow.nodes.filter((node) => !isAiAttachmentNode(node) && !connected.has(node.id) && !['note', 'group'].includes(node.category));
  for (const node of disconnected) issues.push({ severity: 'warning', code: 'DISCONNECTED_NODE', message: `${node.name} is disconnected.`, nodeId: node.id });
  const outgoingByNode = new Map(workflow.nodes.map((node) => [node.id, workflow.connections.filter((edge) => edge.sourceNodeId === node.id)]));
  const incomingByNode = new Map(workflow.nodes.map((node) => [node.id, workflow.connections.filter((edge) => edge.targetNodeId === node.id)]));
  for (const node of workflow.nodes) {
    if (isAiAttachmentNode(node)) {
      const edges = workflow.connections.filter((edge) => edge.sourceNodeId === node.id && isAiAttachmentConnection(edge));
      if (!node.attachmentType || !node.attachmentSubtype || !node.attachmentStatus) issues.push({ severity: 'error', code: 'INVALID_ATTACHMENT_METADATA', message: `${node.name} has incomplete attachment metadata.`, nodeId: node.id });
      if (!edges.length) issues.push({ severity: 'warning', code: 'ORPHANED_ATTACHMENT', message: `${node.name} is not attached to an AI Agent.`, nodeId: node.id });
      continue;
    }
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
  for (const agent of workflow.nodes.filter(isN8nAiAgent)) {
    const attached = workflow.connections.filter((edge) => edge.targetNodeId === agent.id && isAiAttachmentConnection(edge));
    const models = attached.filter((edge) => edge.connectionKind === 'ai-chat-model');
    const memories = attached.filter((edge) => edge.connectionKind === 'ai-memory');
    if (!models.length) issues.push({ severity: 'warning', code: 'AI_CHAT_MODEL_REQUIRED', message: `${agent.name} requires one Chat Model attachment.`, nodeId: agent.id });
    if (models.length > 1) issues.push({ severity: 'error', code: 'DUPLICATE_CHAT_MODEL', message: `${agent.name} can have only one Chat Model.`, nodeId: agent.id });
    if (memories.length > 1) issues.push({ severity: 'error', code: 'DUPLICATE_MEMORY', message: `${agent.name} can have only one Memory attachment.`, nodeId: agent.id });
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
  for (const connection of workflow.connections.filter((edge) => !isAiAttachmentConnection(edge))) adjacency.set(connection.sourceNodeId, [...(adjacency.get(connection.sourceNodeId) ?? []), connection.targetNodeId]);
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string, path: string[]): void => {
    if (active.has(id)) {
      const cycle = path.slice(path.indexOf(id));
      const cycleIds = new Set(cycle);
      const intentionalNode = cycle.some((nodeId) => ['loop', 'retry', 'human_approval'].includes(nodeById.get(nodeId)?.category ?? ''));
      const intentionalEdge = workflow.connections.some((edge) => cycleIds.has(edge.sourceNodeId) && cycleIds.has(edge.targetNodeId) && (edge.style === 'loop' || edge.branchLabel === 'LOOP'));
      if (!intentionalNode && !intentionalEdge) issues.push({ severity: 'error', code: 'INVALID_CYCLE', message: 'A circular dependency exists without an explicit loop, retry, revision, or approval boundary.', nodeId: id });
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
  const executionNodes = workflow.nodes.filter((node) => !isAiAttachmentNode(node));
  const executionConnections = workflow.connections.filter((edge) => !isAiAttachmentConnection(edge));
  const incoming = new Map(executionNodes.map((node) => [node.id, 0]));
  for (const connection of executionConnections) incoming.set(connection.targetNodeId, (incoming.get(connection.targetNodeId) ?? 0) + 1);
  const depth = new Map<string, number>();
  const queue = executionNodes.filter((node) => (incoming.get(node.id) ?? 0) === 0).map((node) => node.id);
  for (const id of queue) depth.set(id, 0);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    if (!id) continue;
    for (const connection of executionConnections.filter((item) => item.sourceNodeId === id)) {
      const nextDepth = (depth.get(id) ?? 0) + 1;
      depth.set(connection.targetNodeId, Math.max(depth.get(connection.targetNodeId) ?? 0, nextDepth));
      const remaining = (incoming.get(connection.targetNodeId) ?? 1) - 1;
      incoming.set(connection.targetNodeId, remaining);
      if (remaining === 0) queue.push(connection.targetNodeId);
    }
  }
  const rows = new Map<number, number>();
  const executionPositions = new Map<string, { x: number; y: number }>();
  executionNodes.forEach((node, index) => {
    const layer = depth.get(node.id) ?? index;
    const row = rows.get(layer) ?? 0; rows.set(layer, row + 1);
    executionPositions.set(node.id, { x: layer * 320, y: row * 190 });
  });
  const positions = new Map([...executionPositions, ...aiAttachmentPositions(workflow, executionPositions)]);
  const nodes = workflow.nodes.map((node, index) => ({ id: `visual-${node.id}`, position: positions.get(node.id) ?? { x: index * 320, y: 0 }, data: { domainNodeId: node.id } }));
  return { nodes, edges: workflow.connections.map((connection) => ({ id: `visual-${connection.id}`, source: `visual-${connection.sourceNodeId}`, target: `visual-${connection.targetNodeId}`, data: { domainConnectionId: connection.id } })) };
}

export function aiAttachmentPositions(workflow: CanonicalWorkflow, executionPositions: ReadonlyMap<string, { x: number; y: number }>): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  for (const agent of workflow.nodes.filter(isN8nAiAgent)) {
    const origin = executionPositions.get(agent.id);
    if (!origin) continue;
    const attachmentIds = workflow.connections
      .filter((edge) => edge.targetNodeId === agent.id && isAiAttachmentConnection(edge))
      .map((edge) => edge.sourceNodeId);
    const count = attachmentIds.length;
    attachmentIds.forEach((id, index) => positions.set(id, {
      x: origin.x + 40 + (index - (count - 1) / 2) * 240,
      y: origin.y + 310,
    }));
  }
  return positions;
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
  for (const node of workflow.nodes.filter((item) => !isAiAttachmentNode(item))) {
    if (node.category === 'trigger' && previous?.category !== 'start') { previous = node; continue; }
    if (previous) connections.push({ id: crypto.randomUUID(), sourceNodeId: previous.id, targetNodeId: node.id, sourcePort: 'output', targetPort: 'input', label: node.category === 'error_handler' ? 'FAILED' : 'SUCCESS', branchLabel: node.category === 'error_handler' ? 'FAILED' : 'SUCCESS', style: node.category === 'error_handler' ? 'failure' : 'success', condition: null, routeType: node.category === 'error_handler' ? 'error' : 'success', mappings: [] });
    previous = node;
  }
  return { ...workflow, connections, warnings: [...workflow.warnings, 'Execution connections were inferred from step order because the AI returned no topology. Review branches and data dependencies before implementation.'], updatedAt: new Date().toISOString() };
}
