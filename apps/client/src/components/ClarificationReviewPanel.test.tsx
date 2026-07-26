// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ClarificationReviewPanel } from './ClarificationReviewPanel';

const diagnostics = {
  version: '1.0', rulesVersion: '1.0', businessObjective: 'Process requests',
  actors: ['Manager'], applicationsAndSystems: ['Asana'], triggers: ['Request submitted'],
  outcomes: ['Request completed'], approvals: [], waits: [], retries: [], loops: [],
  synchronizationSignals: [], missingInformation: ['Approval owner is not specified'],
  summary: {
    confidence: { score: 90, level: 'high', tracedSignals: 4, evidenceBackedSignals: 2, totalSignals: 4 },
    coverage: { score: 70, level: 'medium', detectedCategories: 7, totalCategories: 10, missingInformationCount: 1 },
  },
} as const;

const recommendation = {
  id: 'process-clarification-actor-owner', category: 'actor-owner',
  question: 'Who owns or performs this step?', reason: 'The responsible actor or owner is missing.',
  importance: 'required', sourceRequirementIds: ['segment-1'], suggestedAnswerType: 'actor',
} as const;

describe('ClarificationReviewPanel', () => {
  afterEach(cleanup);

  it('highlights and expands required recommendations', () => {
    render(<ClarificationReviewPanel diagnostics={diagnostics} recommendations={[recommendation]} />);
    const panel = screen.getByRole('region', { name: 'Clarification Review' });
    expect(panel).toHaveClass('required');
    expect(panel.querySelector('details')).toHaveAttribute('open');
    expect(screen.getByText('Who owns or performs this step?')).toBeInTheDocument();
    expect(screen.getByText('Suggested answer: actor')).toBeInTheDocument();
  });

  it('keeps advisory recommendations collapsed in server order', () => {
    const items = [
      { ...recommendation, id: 'process-clarification-outcome', category: 'outcome', importance: 'recommended', question: 'What is the outcome?', suggestedAnswerType: 'text' },
      { ...recommendation, id: 'process-clarification-error-handling', category: 'error-handling', importance: 'optional', question: 'What happens on failure?', suggestedAnswerType: 'single-choice' },
    ];
    render(<ClarificationReviewPanel diagnostics={diagnostics} recommendations={items} />);
    const details = screen.getByRole('region', { name: 'Clarification Review' }).querySelector('details');
    expect(details).not.toHaveAttribute('open');
    const questions = screen.getAllByText(/What (?:is the outcome|happens on failure)\?/i);
    expect(questions.map((item) => item.textContent)).toEqual(['What is the outcome?', 'What happens on failure?']);
  });

  it('shows an empty state when diagnostics exist without recommendations', () => {
    render(<ClarificationReviewPanel diagnostics={{ ...diagnostics, missingInformation: [] }} recommendations={[]} />);
    expect(screen.getByText('No clarification needed')).toBeInTheDocument();
  });

  it('renders nothing for legacy responses without diagnostics', () => {
    const { container } = render(<ClarificationReviewPanel diagnostics={undefined} recommendations={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('fails gracefully for malformed optional metadata', () => {
    const malformed = render(<ClarificationReviewPanel diagnostics={{ version: 'broken' }} recommendations={[]} />);
    expect(malformed.container).toBeEmptyDOMElement();
    malformed.unmount();
    render(<ClarificationReviewPanel diagnostics={diagnostics} recommendations={{ invalid: true }} />);
    expect(screen.getByText('No clarification needed')).toBeInTheDocument();
  });
});
