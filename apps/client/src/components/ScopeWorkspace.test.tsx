// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowSetFromGraph, leadQualificationWorkflow, projectWorkflowToVisualGraph, type Project } from '@awm/shared';
import { ScopeWorkspace } from './ScopeWorkspace';

const now = new Date().toISOString();
const project: Project = {
  id: '00000000-0000-4000-8000-000000000001', name: 'Lead intake', clientName: '', description: '', platform: 'n8n', status: 'draft', originalScope: '', visualGraph: { nodes: [], edges: [] }, createdAt: now, updatedAt: now,
  workflowSet: { schemaVersion: '1.0', workflows: [{ id: '00000000-0000-4000-8000-000000000002', name: 'Lead intake', description: '', triggerSummary: 'Manual or upstream start', platformSummary: 'n8n', readiness: 'draft', status: 'active', applications: [], createdAt: now, updatedAt: now }], nodeReferences: [], connectionReferences: [], createdAt: now, updatedAt: now },
  workflow: { schemaVersion: '1.0', id: '00000000-0000-4000-8000-000000000002', name: 'Lead intake', summary: '', objective: '', targetPlatform: 'n8n', confidence: null, actors: [], systems: [], nodes: [], connections: [], branches: [], errorHandling: [], clarificationQuestions: [], risks: [], complexity: 'simple', assumptions: [], missingInformation: [], warnings: [], recommendations: [], completionCriteria: [], estimatedExecutionTime: '', createdAt: now, updatedAt: now }
};

describe('ScopeWorkspace', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it('accepts pasted requirements and updates counts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ success: true, data: { provider: 'local', available: true, models: ['preview'], message: 'ready' }, error: null, meta: { requestId: 'test' } }) }));
    render(<ScopeWorkspace project={project} onBack={vi.fn()} onSaved={vi.fn()} onOpenBuilder={undefined} />);
    expect(screen.getByRole('banner')).toHaveClass('sticky-global-header');
    expect(screen.getByRole('button', { name: 'Analyze automatically' }).closest('section')).toHaveClass('sticky-workspace-toolbar');
    expect(screen.getByRole('button', { name: 'Generate as single workflow' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Scope of Work text'), { target: { value: 'When a lead arrives, notify sales.' } });
    expect(screen.getByText('6 words')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save scope' })).toBeEnabled();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it('clears a stale analysis when the requirements change', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ success: true, data: { provider: 'local', available: true, models: ['preview'], message: 'ready' }, error: null, meta: { requestId: 'test' } }) }));
    const analyzedProject: Project = {
      ...project,
      originalScope: 'When a lead arrives, qualify it.',
      workflow: leadQualificationWorkflow,
      workflowSet: createWorkflowSetFromGraph(leadQualificationWorkflow),
      visualGraph: projectWorkflowToVisualGraph(leadQualificationWorkflow),
    };
    render(<ScopeWorkspace project={analyzedProject} onBack={vi.fn()} onSaved={vi.fn()} onOpenBuilder={vi.fn()} />);

    expect(screen.getByText('Choose how to continue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start new workflow' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Generate as single workflow' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Regenerate automatically' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Use existing workflow' })).toBeEnabled();
    expect(screen.getByText('Workflow steps').previousElementSibling).toHaveTextContent(String(analyzedProject.workflow.nodes.length));
    expect(screen.getByText('Branches').previousElementSibling).toHaveTextContent(String(analyzedProject.workflow.branches.length));
    fireEvent.change(screen.getByLabelText('Scope of Work text'), { target: { value: 'When an invoice arrives, request finance approval.' } });

    expect(screen.queryByText('Choose how to continue')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze automatically' })).toBeEnabled();
  });

  it('starts a different workflow without reusing the saved requirements or analysis', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ success: true, data: { provider: 'local', available: true, models: ['preview'], message: 'ready' }, error: null, meta: { requestId: 'test' } }) }));
    const analyzedProject: Project = {
      ...project,
      originalScope: 'When a lead arrives, qualify it.',
      workflow: leadQualificationWorkflow,
      workflowSet: createWorkflowSetFromGraph(leadQualificationWorkflow),
      visualGraph: projectWorkflowToVisualGraph(leadQualificationWorkflow),
    };
    render(<ScopeWorkspace project={analyzedProject} onBack={vi.fn()} onSaved={vi.fn()} onOpenBuilder={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start new workflow' }));

    expect(screen.getByLabelText('Scope of Work text')).toHaveValue('');
    expect(screen.queryByText('Choose how to continue')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze automatically' })).toBeDisabled();
  });
});
