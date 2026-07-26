// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('renders and captures every supported answer type', () => {
    const items = [
      { ...recommendation, id: 'process-clarification-trigger', category: 'trigger', suggestedAnswerType: 'text', question: 'Text question?' },
      { ...recommendation, id: 'process-clarification-approval', category: 'approval', suggestedAnswerType: 'boolean', question: 'Boolean question?' },
      { ...recommendation, id: 'process-clarification-outcome', category: 'outcome', suggestedAnswerType: 'single-choice', question: 'Single question?', options: ['Approved', 'Rejected'] },
      { ...recommendation, id: 'process-clarification-synchronization-behavior', category: 'synchronization-behavior', suggestedAnswerType: 'multi-choice', question: 'Multi question?', options: ['Finance', 'Operations'] },
      { ...recommendation, id: 'process-clarification-approval-timeout', category: 'approval-timeout', suggestedAnswerType: 'duration', question: 'Duration question?' },
      { ...recommendation, id: 'process-clarification-application-system', category: 'application-system', suggestedAnswerType: 'application', question: 'Application question?' },
      { ...recommendation, id: 'process-clarification-actor-owner', category: 'actor-owner', suggestedAnswerType: 'actor', question: 'Actor question?' },
    ];
    render(<ClarificationReviewPanel diagnostics={diagnostics} recommendations={items} />);

    fireEvent.change(screen.getByLabelText('Answer: Text question?'), { target: { value: 'Details' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.change(screen.getByLabelText('Answer: Single question?'), { target: { value: 'Approved' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Finance' }));
    fireEvent.change(screen.getByLabelText('Answer: Duration question? value'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Answer: Duration question? unit'), { target: { value: 'days' } });
    fireEvent.change(screen.getByLabelText('Answer: Application question?'), { target: { value: 'Asana' } });
    fireEvent.change(screen.getByLabelText('Answer: Actor question?'), { target: { value: 'Finance manager' } });

    expect(screen.getByRole('status')).toHaveTextContent('7 of 7 answered locally');
    expect(screen.getAllByText('Answered')).toHaveLength(7);
  });

  it('keeps answers keyed independently and supports per-item and clear-all actions', () => {
    const items = [
      { ...recommendation, id: 'process-clarification-trigger', category: 'trigger', question: 'First answer?' },
      { ...recommendation, id: 'process-clarification-outcome', category: 'outcome', question: 'Second answer?' },
    ];
    render(<ClarificationReviewPanel diagnostics={diagnostics} recommendations={items} />);
    fireEvent.change(screen.getByLabelText('Answer: First answer?'), { target: { value: 'Webhook' } });
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 answered locally');
    expect(screen.getByLabelText('Answer: Second answer?')).toHaveValue('');

    fireEvent.click(screen.getAllByRole('button', { name: 'Clear answer' })[0]!);
    expect(screen.getByRole('status')).toHaveTextContent('0 of 2 answered locally');
    fireEvent.change(screen.getByLabelText('Answer: First answer?'), { target: { value: 'Webhook' } });
    fireEvent.change(screen.getByLabelText('Answer: Second answer?'), { target: { value: 'Completed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear all answers' }));
    expect(screen.getByRole('status')).toHaveTextContent('0 of 2 answered locally');
  });

  it('clears local answers when a different analysis result loads', () => {
    const view = render(<ClarificationReviewPanel analysisKey="analysis-1" diagnostics={diagnostics} recommendations={[recommendation]} />);
    fireEvent.change(screen.getByLabelText('Answer: Who owns or performs this step?'), { target: { value: 'Operations' } });
    expect(screen.getByRole('status')).toHaveTextContent('1 of 1 answered locally');

    view.rerender(<ClarificationReviewPanel analysisKey="analysis-2" diagnostics={diagnostics} recommendations={[recommendation]} />);
    expect(screen.getByLabelText('Answer: Who owns or performs this step?')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('0 of 1 answered locally');
  });

  it('falls back to text when choice recommendations have no options', () => {
    const choices = [
      { ...recommendation, id: 'process-clarification-outcome', category: 'outcome', suggestedAnswerType: 'single-choice', question: 'Single fallback?' },
      { ...recommendation, id: 'process-clarification-synchronization-behavior', category: 'synchronization-behavior', suggestedAnswerType: 'multi-choice', question: 'Multi fallback?' },
    ];
    render(<ClarificationReviewPanel diagnostics={diagnostics} recommendations={choices} />);
    expect(screen.getByLabelText('Answer: Single fallback?')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Answer: Multi fallback?')).toHaveAttribute('type', 'text');
  });
});
