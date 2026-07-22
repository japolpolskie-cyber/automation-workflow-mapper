// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { createWorkflowSetFromGraph, leadQualificationWorkflow, projectWorkflowToVisualGraph, type Project } from '@awm/shared';
import { describe, expect, it } from 'vitest';
import { NodeConfigurationPanel } from './NodeConfigurationPanel';
import { useEditorStore } from './editor-store';
import { manualLibraryFor } from './manual-platform-library';

describe('NodeConfigurationPanel', () => {
  it('keeps the complete configuration form inside one viewport scroll region', () => {
    const now = new Date().toISOString();
    const workflow = { ...leadQualificationWorkflow, nodes: [], connections: [], branches: [], clarificationQuestions: [], errorHandling: [], risks: [] };
    const project: Project = { id: '90000000-0000-4000-8000-000000000001', name: 'Manual', clientName: '', description: '', platform: 'n8n', status: 'draft', originalScope: '', workflow, workflowSet: createWorkflowSetFromGraph(workflow), visualGraph: projectWorkflowToVisualGraph(workflow), createdAt: now, updatedAt: now };
    useEditorStore.getState().initialize(project);
    useEditorStore.getState().addNode(manualLibraryFor('n8n').items.find((item) => item.id === 'custom')!);
    const { container } = render(<NodeConfigurationPanel plan={undefined} />);
    expect(container.querySelector('.config-scroll')).toBeInTheDocument();
    expect(screen.getByLabelText('Retry attempts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Duplicate node/i })).toBeInTheDocument();
  });
});
