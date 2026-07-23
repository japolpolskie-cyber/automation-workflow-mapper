// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultWorkflowSet, leadQualificationWorkflow, projectWorkflowToVisualGraph, type Project } from '@awm/shared';
import App from './App';

describe('dashboard', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ success: true, data: [], error: null, meta: { requestId: 'test' } }) })); });
  afterEach(() => vi.unstubAllGlobals());
  it('renders the product outcome and creation action', async () => {
    render(<App />);
    expect(screen.getByRole('banner')).toHaveClass('sticky-global-header');
    expect(screen.getByText(/Turn requirements into/i)).toBeInTheDocument();
    expect(await screen.findByText('Your first workflow starts here')).toBeInTheDocument();
  });

  it('requires confirmation, deletes the selected card, and renders the clean empty state', async () => {
    const now = new Date().toISOString();
    const project: Project = {
      id: crypto.randomUUID(), name: 'Disposable workflow', clientName: '', description: '', platform: 'n8n',
      status: 'draft', originalScope: '', workflow: leadQualificationWorkflow,
      workflowSet: createDefaultWorkflowSet(leadQualificationWorkflow, now),
      visualGraph: projectWorkflowToVisualGraph(leadQualificationWorkflow), createdAt: now, updatedAt: now,
    };
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const data = url.endsWith('/workflows/archived') ? [] : url.endsWith('/workflows') && !init?.method ? [project] : project;
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ success: true, data, error: null, meta: { requestId: 'test' } }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Disposable workflow' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete this project permanently?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Disposable workflow')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Disposable workflow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete project' }));

    await waitFor(() => expect(screen.getByText('Your first workflow starts here')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/workflows/${project.id}$`)), expect.objectContaining({ method: 'DELETE' }));
  });
});
