// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Project } from '@awm/shared';
import { WorkflowEditor } from './WorkflowEditor';

const now = new Date().toISOString();
const project: Project = {
  id: '91000000-0000-4000-8000-000000000001', name: 'Blank builder', clientName: '', description: '', platform: 'n8n', status: 'draft', originalScope: '', createdAt: now, updatedAt: now,
  workflow: { schemaVersion: '2.0', id: '91000000-0000-4000-8000-000000000002', name: 'Blank builder', summary: '', objective: '', targetPlatform: 'n8n', confidence: null, actors: [], systems: [], nodes: [], connections: [], branches: [], errorHandling: [], clarificationQuestions: [], risks: [], complexity: 'simple', assumptions: [], missingInformation: [], warnings: [], recommendations: [], completionCriteria: [], estimatedExecutionTime: '', createdAt: now, updatedAt: now },
  workflowSet: { schemaVersion: '1.0', workflows: [{ id: '91000000-0000-4000-8000-000000000002', name: 'Blank builder', description: '', triggerSummary: 'Manual or upstream start', platformSummary: 'n8n', readiness: 'draft', status: 'active', applications: [], createdAt: now, updatedAt: now }], nodeReferences: [], connectionReferences: [], createdAt: now, updatedAt: now },
  visualGraph: { nodes: [], edges: [] },
};

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

describe('WorkflowEditor startup', () => {
  it('opens a blank builder before the editor store initialization effect runs', () => {
    render(<WorkflowEditor project={project} onBack={vi.fn()} onHome={vi.fn()} onSaved={vi.fn()} onTemplateSaved={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Save workflow/i })).toBeInTheDocument();
    expect(screen.getByText('Build your workflow from scratch')).toBeInTheDocument();
  });
});
