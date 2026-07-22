// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { leadQualificationWorkflow, type WorkflowNode } from '@awm/shared';
import { WorkflowCanvasNode } from './WorkflowCanvasNode';

const propsFor = (node: WorkflowNode, extra: Record<string, unknown> = {}): Parameters<typeof WorkflowCanvasNode>[0] => ({ id: `visual-${node.id}`, data: { domainNodeId: node.id, node, platform: 'n8n', ...extra }, type: 'workflow', selected: false, dragging: false, draggable: true, selectable: true, deletable: true, isConnectable: true, positionAbsoluteX: 0, positionAbsoluteY: 0, zIndex: 0 } as unknown as Parameters<typeof WorkflowCanvasNode>[0]);

describe('WorkflowCanvasNode AI attachments', () => {
  it('preserves execution handles and renders three specialized ports for an n8n AI Agent', () => {
    const onAddAttachment = vi.fn();
    const agent = { ...leadQualificationWorkflow.nodes[1]!, category: 'ai' as const, name: 'Support AI Agent', service: 'n8n', operation: 'AI Agent', configuration: { n8nAiAgent: true } };
    render(<ReactFlowProvider><WorkflowCanvasNode {...propsFor(agent, { onAddAttachment, attachmentSummary: { model: undefined, memory: undefined, tools: [], status: 'Unresolved' } })} /></ReactFlowProvider>);
    expect(screen.getByText('Chat model required')).toBeInTheDocument();
    expect(document.querySelector('.react-flow__handle-left')).toBeInTheDocument();
    expect(document.querySelector('.react-flow__handle-right')).toBeInTheDocument();
    expect(document.querySelectorAll('.ai-agent-handle')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Add chat model' }));
    expect(onAddAttachment).toHaveBeenCalledWith(agent.id, 'chat-model');
  });

  it('renders a compact attachment without normal execution handles', () => {
    const attachment = { ...leadQualificationWorkflow.nodes[1]!, nodeKind: 'ai-attachment' as const, category: 'ai' as const, attachmentType: 'memory' as const, attachmentSubtype: 'simple-memory', attachmentStatus: 'configured' as const, name: 'Simple Memory', operation: 'Simple Memory' };
    const { container } = render(<ReactFlowProvider><WorkflowCanvasNode {...propsFor(attachment)} /></ReactFlowProvider>);
    expect(container.querySelector('.ai-attachment-card')).toHaveTextContent('Simple Memory');
    expect(container.querySelector('.ai-attachment-handle')).toBeInTheDocument();
    expect(container.querySelector('.flow-handle')).not.toBeInTheDocument();
  });
});
