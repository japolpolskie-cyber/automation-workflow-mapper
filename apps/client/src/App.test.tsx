// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultWorkflowSet, leadQualificationWorkflow, projectWorkflowToVisualGraph, type Project } from '@awm/shared';
import App from './App';

const stylesheet = readFileSync('src/styles.css', 'utf8');

const response = (data: unknown, ok = true, status = ok ? 200 : 500) => ({
  ok, status, headers: { get: () => 'application/json' },
  json: async () => ok
    ? ({ success: true, data, error: null, meta: { requestId: 'test' } })
    : ({ success: false, data: null, error: { code: 'REQUEST_FAILED', message: String(data) }, meta: { requestId: 'test' } }),
});

const dashboardProject = (name = 'Disposable workflow'): Project => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), name, clientName: 'A very long internal workspace owner name', description: 'A detailed project description that remains contained inside the project card at narrower supported widths.', platform: 'n8n',
    status: 'draft', originalScope: '', workflow: leadQualificationWorkflow,
    workflowSet: createDefaultWorkflowSet(leadQualificationWorkflow, now),
    visualGraph: projectWorkflowToVisualGraph(leadQualificationWorkflow), createdAt: now, updatedAt: now,
  };
};

describe('dashboard', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ success: true, data: [], error: null, meta: { requestId: 'test' } }) })); });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  it('renders the product outcome and creation action', async () => {
    render(<App />);
    expect(screen.getByRole('banner')).toHaveClass('sticky-global-header');
    expect(screen.getByText(/Turn requirements into/i)).toBeInTheDocument();
    expect(await screen.findByText('Your first workflow starts here')).toBeInTheDocument();
  });

  it('requires confirmation, deletes the selected card, and renders the clean empty state', async () => {
    const project = dashboardProject();
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
    const confirmDelete = screen.getByRole('button', { name: 'Delete project' });
    fireEvent.click(confirmDelete);
    fireEvent.click(confirmDelete);

    await waitFor(() => expect(screen.getByText('Your first workflow starts here')).toBeInTheDocument());
    expect(fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith(`/workflows/${project.id}`) && init?.method === 'DELETE')).toHaveLength(1);
  });

  it('keeps long card content and metadata separate from accessible project actions', async () => {
    const project = dashboardProject('An exceptionally long workflow project title that must remain contained');
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return response(url.endsWith('/workflows') ? [project] : []);
    }));
    render(<App />);

    const card = (await screen.findByText(project.name)).closest('.project-card')!;
    expect(card.querySelector('.card-meta')).toBeInTheDocument();
    expect(card.querySelector('.project-actions')).toBeInTheDocument();
    expect(card.querySelector('.card-meta')?.parentElement).toBe(card);
    expect(card.querySelector('.project-actions')?.parentElement).toBe(card);
    expect(screen.getByRole('button', { name: `Archive ${project.name}` })).toHaveAttribute('title', 'Archive project');
    expect(screen.getByRole('button', { name: `Delete ${project.name}` })).toHaveAttribute('title', 'Delete project permanently');
  });

  it('keeps project status badges right-aligned and content-sized without changing footer spacing', async () => {
    const statuses = ['ready', 'draft', 'needs_input'] as const;
    const projects = statuses.map((status) => ({
      ...dashboardProject(`A very long ${status} workflow title that must not move its status badge`),
      status,
    }));
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return response(url.endsWith('/workflows') ? projects : []);
    }));
    render(<App />);

    for (const project of projects) {
      const card = (await screen.findByText(project.name)).closest('.project-card')!;
      const header = card.querySelector('.card-top') as HTMLElement;
      const platform = card.querySelector('.platform-mark') as HTMLElement;
      const badge = within(header).getByText(project.status.replace('_', ' '));
      const footer = card.querySelector('.card-meta') as HTMLElement;

      expect(header.firstElementChild).toBe(platform);
      expect(header.lastElementChild).toBe(badge);
      expect(card.querySelector('.project-actions')).toBeInTheDocument();
      expect(footer).toHaveClass('card-meta');
    }
    expect(stylesheet).toMatch(/\.card-top\s*{\s*width:\s*100%;\s*}/);
    expect(stylesheet).toMatch(/\.card-meta\s*{\s*padding-right:\s*82px;\s*}/);
    expect(stylesheet).toMatch(/\.project-status\s*{[^}]*flex:\s*0 0 auto;[^}]*width:\s*fit-content;[^}]*margin-left:\s*auto;/s);
  });

  it('keeps shared button hover, focus, disabled, and loading states stable', () => {
    expect(stylesheet).toMatch(/\.button\.primary:hover:not\(:disabled\)/);
    expect(stylesheet).toMatch(/\.button\.secondary:hover:not\(:disabled\)/);
    expect(stylesheet).toMatch(/\.button:focus-visible\s*{[^}]*outline:[^}]*outline-offset:/s);
    expect(stylesheet).toMatch(/\.button:disabled\s*{[^}]*cursor:\s*not-allowed;[^}]*transform:\s*none;[^}]*box-shadow:\s*none;/s);
    expect(stylesheet).toMatch(/\.button\s*>\s*\.spin\s*{\s*flex:\s*0 0 auto;\s*}/);
  });

  it('guards archive against duplicate submission and recovers with useful failure feedback', async () => {
    const project = dashboardProject('Archive once');
    let rejectArchive!: (value: ReturnType<typeof response>) => void;
    const pendingArchive = new Promise<ReturnType<typeof response>>((resolve) => { rejectArchive = resolve; });
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'PATCH' && url.endsWith('/archive')) return pendingArchive;
      return Promise.resolve(response(url.endsWith('/workflows') ? [project] : []));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(<App />);

    const archive = await screen.findByRole('button', { name: 'Archive Archive once' });
    fireEvent.click(archive);
    fireEvent.click(archive);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1);
    expect(archive).toBeDisabled();
    rejectArchive(response('The project could not be archived right now.', false));

    expect(await screen.findByText('The project action could not be completed')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Archive Archive once' })).toBeEnabled());
    expect(screen.getByText('Archive once')).toBeInTheDocument();
  });

  it('distinguishes a project API outage from an empty workspace and offers retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Projects are temporarily unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry loading projects' })).toBeEnabled();
    expect(screen.queryByText('Your first workflow starts here')).not.toBeInTheDocument();
  });
});
