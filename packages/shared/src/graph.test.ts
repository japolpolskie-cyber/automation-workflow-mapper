import { describe, expect, it } from 'vitest';
import { leadQualificationWorkflow } from './fixtures.js';
import { applyVisualTopology, inferWorkflowConnections, projectWorkflowToVisualGraph, validateWorkflowGraph } from './graph.js';

describe('workflow graph integrity', () => {
  it('infers an ordered topology when AI output has no connections', () => {
    const workflow = structuredClone(leadQualificationWorkflow); workflow.connections = [];
    const inferred = inferWorkflowConnections(workflow);
    expect(inferred.connections.length).toBeGreaterThan(0);
    expect(inferred.connections[0]).toMatchObject({ sourceNodeId: workflow.nodes[0]!.id, targetNodeId: workflow.nodes[1]!.id });
    expect(inferred.warnings.at(-1)).toMatch(/inferred/i);
  });
  it('accepts the representative lead qualification workflow', () => {
    const result = validateWorkflowGraph(leadQualificationWorkflow);
    expect(result.valid).toBe(true);
    expect(result.statistics).toEqual({ nodes: 9, connections: 10, branches: 2, disconnectedNodes: 0 });
  });

  it('detects dangling connections', () => {
    const workflow = structuredClone(leadQualificationWorkflow);
    workflow.connections[0]!.targetNodeId = '99999999-9999-4999-8999-999999999999';
    expect(validateWorkflowGraph(workflow).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'MISSING_TARGET_NODE', severity: 'error' })]));
  });

  it('detects cycles without an explicit loop node', () => {
    const workflow = structuredClone(leadQualificationWorkflow);
    workflow.connections.push({ ...workflow.connections[0]!, id: '77777777-7777-4777-8777-777777777777', sourceNodeId: workflow.nodes[7]!.id, targetNodeId: workflow.nodes[0]!.id });
    expect(validateWorkflowGraph(workflow).issues.some((issue) => issue.code === 'INVALID_CYCLE')).toBe(true);
  });

  it('accepts an intentional cycle through an explicit loop connection', () => {
    const workflow = structuredClone(leadQualificationWorkflow);
    const loopNode = { ...workflow.nodes[1]!, id: '80000000-0000-4000-8000-000000000001', category: 'loop' as const, name: 'Repeat until complete' };
    workflow.nodes.push(loopNode);
    workflow.connections.push(
      { ...workflow.connections[0]!, id: '80000000-0000-4000-8000-000000000002', sourceNodeId: workflow.nodes[1]!.id, targetNodeId: loopNode.id },
      { ...workflow.connections[0]!, id: '80000000-0000-4000-8000-000000000003', sourceNodeId: loopNode.id, targetNodeId: workflow.nodes[1]!.id, sourcePort: 'item', label: 'Current Item', branchLabel: 'LOOP', style: 'loop', routeType: 'conditional' },
    );
    expect(validateWorkflowGraph(workflow).issues.some((issue) => issue.code === 'INVALID_CYCLE')).toBe(false);
  });

  it('validates n8n AI attachments separately from execution flow', () => {
    const workflow = structuredClone(leadQualificationWorkflow);
    workflow.targetPlatform = 'n8n';
    const agent = { ...workflow.nodes[1]!, id: crypto.randomUUID(), category: 'ai' as const, name: 'Customer Support AI Agent', operation: 'AI Agent', service: 'n8n' };
    const model = { ...workflow.nodes[1]!, id: crypto.randomUUID(), category: 'ai' as const, nodeKind: 'ai-attachment' as const, attachmentType: 'chat-model' as const, attachmentSubtype: 'openai', attachmentStatus: 'configured' as const, name: 'OpenAI Chat Model' };
    const connection = { ...workflow.connections[0]!, id: crypto.randomUUID(), sourceNodeId: model.id, targetNodeId: agent.id, connectionKind: 'ai-chat-model' as const, sourcePort: 'attachment', targetPort: 'ai-chat-model', label: 'Chat Model', branchLabel: null, routeType: 'default' as const, style: 'default' as const };
    workflow.nodes.push(agent, model);
    workflow.connections.push(connection);
    const result = validateWorkflowGraph(workflow);
    expect(result.issues.some((issue) => issue.code === 'ORPHANED_ATTACHMENT')).toBe(false);
    expect(result.issues.some((issue) => issue.nodeId === model.id && issue.code === 'DISCONNECTED_NODE')).toBe(false);
  });

  it('rejects duplicate models, incompatible ports, and platform mismatch', () => {
    const workflow = structuredClone(leadQualificationWorkflow);
    workflow.targetPlatform = 'make';
    const agent = { ...workflow.nodes[1]!, id: crypto.randomUUID(), category: 'ai' as const, name: 'AI Agent', operation: 'AI Agent', service: 'n8n' };
    const models = [0, 1].map(() => ({ ...workflow.nodes[1]!, id: crypto.randomUUID(), category: 'ai' as const, nodeKind: 'ai-attachment' as const, attachmentType: 'chat-model' as const, attachmentSubtype: 'openai', attachmentStatus: 'configured' as const, name: 'Chat Model' }));
    workflow.nodes.push(agent, ...models);
    workflow.connections.push(...models.map((model) => ({ ...workflow.connections[0]!, id: crypto.randomUUID(), sourceNodeId: model.id, targetNodeId: agent.id, connectionKind: 'ai-chat-model' as const, sourcePort: 'attachment', targetPort: 'ai-memory', branchLabel: null, routeType: 'default' as const })));
    const codes = validateWorkflowGraph(workflow).issues.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(['ATTACHMENT_PLATFORM_MISMATCH', 'INVALID_ATTACHMENT_PORT', 'DUPLICATE_CHAT_MODEL']));
  });
});

describe('visual graph projection', () => {
  it('projects every canonical node and connection without becoming the source of truth', () => {
    const visual = projectWorkflowToVisualGraph(leadQualificationWorkflow);
    expect(visual.nodes).toHaveLength(leadQualificationWorkflow.nodes.length);
    expect(visual.edges).toHaveLength(leadQualificationWorkflow.connections.length);
    expect(visual.nodes.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(true);
  });

  it('applies visual topology only through canonical IDs', () => {
    const visual = projectWorkflowToVisualGraph(leadQualificationWorkflow);
    const first = visual.edges[0]!;
    const source = first.source;
    first.source = first.target;
    first.target = source;
    const updated = applyVisualTopology(leadQualificationWorkflow, visual);
    expect(updated.connections[0]!.sourceNodeId).toBe(leadQualificationWorkflow.connections[0]!.targetNodeId);
    expect(leadQualificationWorkflow.connections[0]!.sourceNodeId).not.toBe(updated.connections[0]!.sourceNodeId);
  });

  it('rejects visual references that do not exist in the canonical workflow', () => {
    const visual = projectWorkflowToVisualGraph(leadQualificationWorkflow);
    visual.edges[0]!.data.domainConnectionId = '88888888-8888-4888-8888-888888888888';
    expect(() => applyVisualTopology(leadQualificationWorkflow, visual)).toThrow(/unknown canonical/i);
  });
});
