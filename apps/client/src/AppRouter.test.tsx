// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRouter } from './AppRouter';

vi.mock('./App', () => ({ default: () => <div>Main Mapper</div> }));
vi.mock('./features/workflow-brief/WorkflowBriefPreviewPage', () => ({ WorkflowBriefPreviewPage: () => <div>Internal Brief Preview</div> }));
afterEach(cleanup);

describe('AppRouter', () => {
  it('renders the isolated preview only at its exact internal route', () => {
    render(<AppRouter pathname="/internal/workflow-brief" />);
    expect(screen.getByText('Internal Brief Preview')).toBeInTheDocument();
    expect(screen.queryByText('Main Mapper')).not.toBeInTheDocument();
  });

  it('keeps the main Mapper route unaffected', () => {
    render(<AppRouter pathname="/" />);
    expect(screen.getByText('Main Mapper')).toBeInTheDocument();
    expect(screen.queryByText('Internal Brief Preview')).not.toBeInTheDocument();
  });
});

