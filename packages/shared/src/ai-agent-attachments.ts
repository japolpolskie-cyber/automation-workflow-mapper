import type { CanonicalWorkflow, WorkflowConnection, WorkflowNode } from './domain.js';

export type AiAttachmentType = 'chat-model' | 'memory' | 'tool';
export type AiAttachmentConnectionKind = 'ai-chat-model' | 'ai-memory' | 'ai-tool';

export const aiAttachmentPortFor = (type: AiAttachmentType): AiAttachmentConnectionKind =>
  type === 'chat-model' ? 'ai-chat-model' : type === 'memory' ? 'ai-memory' : 'ai-tool';
export const isAiAttachmentNode = (node: WorkflowNode): boolean => node.nodeKind === 'ai-attachment';
export const isN8nAiAgent = (node: WorkflowNode): boolean => node.nodeKind !== 'ai-attachment' && node.category === 'ai' && /ai agent/i.test(`${node.operation ?? ''} ${node.name}`);
export const isAiAttachmentConnection = (edge: WorkflowConnection): boolean => Boolean(edge.connectionKind && edge.connectionKind !== 'execution');

export function attachmentsForAgent(workflow: CanonicalWorkflow, agentId: string): WorkflowNode[] {
  const ids = new Set(workflow.connections.filter((edge) => edge.targetNodeId === agentId && isAiAttachmentConnection(edge)).map((edge) => edge.sourceNodeId));
  return workflow.nodes.filter((node) => ids.has(node.id) && isAiAttachmentNode(node));
}

export interface AiAgentAttachmentSummary {
  model: WorkflowNode | undefined;
  memory: WorkflowNode | undefined;
  tools: WorkflowNode[];
  status: 'Unresolved' | 'Ready' | 'Needs configuration';
}

export function aiAgentAttachmentSummary(workflow: CanonicalWorkflow, agentId: string): AiAgentAttachmentSummary {
  const attachments = attachmentsForAgent(workflow, agentId);
  const model = attachments.find((node) => node.attachmentType === 'chat-model');
  const memory = attachments.find((node) => node.attachmentType === 'memory');
  const tools = attachments.filter((node) => node.attachmentType === 'tool');
  const invalid = attachments.some((node) => node.attachmentStatus === 'invalid' || !node.attachmentSubtype);
  return { model, memory, tools, status: !model ? 'Unresolved' as const : model.attachmentStatus === 'configured' && !invalid ? 'Ready' as const : 'Needs configuration' as const };
}
