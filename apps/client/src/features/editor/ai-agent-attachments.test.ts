import { describe, expect, it } from 'vitest';
import { aiAgentAttachmentSummary, createWorkflowSetFromGraph, leadQualificationWorkflow, projectWorkflowToVisualGraph, type Project } from '@awm/shared';
import { useEditorStore } from './editor-store';
import { manualLibraryFor } from './manual-platform-library';
import { aiAttachmentOptions } from './ai-attachment-options';

const projectFor = (platform: Project['platform'] = 'n8n'): Project => {
  const now = new Date().toISOString();
  const workflow = { ...structuredClone(leadQualificationWorkflow), targetPlatform: platform, nodes: [], connections: [], branches: [], clarificationQuestions: [], errorHandling: [], risks: [] };
  return { id: crypto.randomUUID(), name: 'Agent editor', clientName: '', description: '', platform, status: 'draft', originalScope: '', workflow, workflowSet: createWorkflowSetFromGraph(workflow), visualGraph: projectWorkflowToVisualGraph(workflow), createdAt: now, updatedAt: now };
};

describe('n8n AI Agent attachments', () => {
  it('creates typed model, memory, and multiple tool cards with non-execution edges', () => {
    useEditorStore.getState().initialize(projectFor());
    const agentId = useEditorStore.getState().addNode(manualLibraryFor('n8n').items.find((item) => item.id === 'ai')!, { x: 300, y: 100 }, 'n8n');
    expect(useEditorStore.getState().addAiAttachment(agentId, aiAttachmentOptions['chat-model'][0]!)).toBeTruthy();
    expect(useEditorStore.getState().addAiAttachment(agentId, aiAttachmentOptions.memory[0]!)).toBeTruthy();
    expect(useEditorStore.getState().addAiAttachment(agentId, aiAttachmentOptions.tool[0]!)).toBeTruthy();
    expect(useEditorStore.getState().addAiAttachment(agentId, aiAttachmentOptions.tool[1]!)).toBeTruthy();
    const state = useEditorStore.getState();
    expect(state.workflow.nodes.filter((node) => node.nodeKind === 'ai-attachment')).toHaveLength(4);
    expect(state.workflow.connections.map((edge) => edge.connectionKind)).toEqual(expect.arrayContaining(['ai-chat-model', 'ai-memory', 'ai-tool']));
    expect(state.workflow.connections.every((edge) => edge.routeType === 'default')).toBe(true);
    expect(aiAgentAttachmentSummary(state.workflow, agentId).tools).toHaveLength(2);
  });

  it('rejects duplicate model and memory attachments while allowing tools', () => {
    useEditorStore.getState().initialize(projectFor());
    const agentId = useEditorStore.getState().addNode(manualLibraryFor('n8n').items.find((item) => item.id === 'ai')!, undefined, 'n8n');
    expect(useEditorStore.getState().addAiAttachment(agentId, aiAttachmentOptions['chat-model'][0]!)).toBeTruthy();
    expect(useEditorStore.getState().addAiAttachment(agentId, aiAttachmentOptions['chat-model'][1]!)).toBeNull();
    expect(useEditorStore.getState().addAiAttachment(agentId, aiAttachmentOptions.memory[0]!)).toBeTruthy();
    expect(useEditorStore.getState().addAiAttachment(agentId, aiAttachmentOptions.memory[1]!)).toBeNull();
  });

  it('does not add attachments to Make or Zapier nodes', () => {
    useEditorStore.getState().initialize(projectFor('make'));
    const nodeId = useEditorStore.getState().addNode('ai', undefined, 'make');
    expect(useEditorStore.getState().addAiAttachment(nodeId, aiAttachmentOptions['chat-model'][0]!)).toBeNull();
  });

  it('deleting an attachment or its agent removes attachment edges safely', () => {
    useEditorStore.getState().initialize(projectFor());
    const agentId = useEditorStore.getState().addNode(manualLibraryFor('n8n').items.find((item) => item.id === 'ai')!, undefined, 'n8n');
    const attachmentId = useEditorStore.getState().addAiAttachment(agentId, aiAttachmentOptions.tool[0]!)!;
    useEditorStore.getState().deleteNode(`visual-${attachmentId}`);
    expect(useEditorStore.getState().workflow.connections).toHaveLength(0);
    const nextAttachment = useEditorStore.getState().addAiAttachment(agentId, aiAttachmentOptions.tool[1]!)!;
    useEditorStore.getState().deleteNode(`visual-${agentId}`);
    expect(useEditorStore.getState().workflow.connections).toHaveLength(0);
    expect(useEditorStore.getState().workflow.nodes.some((node) => node.id === nextAttachment)).toBe(true);
  });

  it('restores attachment metadata, edges, and saved positions', () => {
    useEditorStore.getState().initialize(projectFor());
    const agentId = useEditorStore.getState().addNode(manualLibraryFor('n8n').items.find((item) => item.id === 'ai')!, undefined, 'n8n');
    const attachmentId = useEditorStore.getState().addAiAttachment(agentId, aiAttachmentOptions.memory[0]!)!;
    const state = useEditorStore.getState();
    const saved: Project = { ...projectFor(), workflow: structuredClone(state.workflow), workflowSet: createWorkflowSetFromGraph(state.workflow), visualGraph: { nodes: state.nodes.map((node) => ({ id: node.id, position: node.position, data: { domainNodeId: node.data.domainNodeId } })), edges: state.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, data: { domainConnectionId: edge.data!.domainConnectionId } })) } };
    const position = state.nodes.find((node) => node.data.domainNodeId === attachmentId)!.position;
    useEditorStore.getState().initialize(saved);
    expect(useEditorStore.getState().workflow.nodes.find((node) => node.id === attachmentId)).toMatchObject({ nodeKind: 'ai-attachment', attachmentType: 'memory' });
    expect(useEditorStore.getState().nodes.find((node) => node.data.domainNodeId === attachmentId)!.position).toEqual(position);
  });
});
