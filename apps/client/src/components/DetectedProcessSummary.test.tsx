// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DetectedProcessSummary } from './DetectedProcessSummary';
import type { DetectedProcessSummary as Summary } from '@awm/shared';

const evidence = { id: 'ev-app', evidenceType: 'explicit' as const, relationship: 'supporting' as const, confidence: 0.99, weight: 5, ruleId: 'application.asana', ruleVersion: '1.0.0', ruleCategory: 'application', sourceLocation: { source: 'scope' as const, start: 0, end: 5 }, evidenceText: 'Asana', explanation: 'Exact application name.', relatedEvidenceIds: [], supportingFactIds: [] };
const confidence = { scoringRuleId: 'weighted-evidence-v1' as const, scoringRuleVersion: '1.0.0' as const, precedence: ['explicit'], contributingEvidenceIds: ['ev-app'], weightedSupport: 4.95, weightedConflict: 0, totalWeight: 5, completenessPenalty: 0, formula: 'support / total', finalConfidence: 0.99 };
const summary: Summary = { version: '1.0', feature: 'k3-deterministic-scope-intelligence', shadowMode: true, facts: [{ id: 'fact-application-asana', kind: 'application', value: 'Asana', explanation: 'Detected explicitly.', evidence: [evidence], confidence }], clarifications: [], knowledgeContext: { catalogVersion: '1.0.0', retrieved: [{ kind: 'application', id: 'asana', reason: 'Explicit.', estimatedCharacters: 200 }], estimatedCharacters: 200, maximumCharacters: 12_000, truncated: false }, generatedAt: '2026-07-16T00:00:00.000Z' };

describe('DetectedProcessSummary', () => {
  it('shows detected facts, confidence, and shadow-mode explanation', () => {
    render(<DetectedProcessSummary summary={summary} />);
    expect(screen.getByText('Detected Process Summary').closest('header')).toHaveClass('sticky-nested-toolbar');
    expect(screen.getByRole('region', { name: 'Detected Process Summary' })).toBeInTheDocument();
    expect(screen.getAllByText('Asana')).toHaveLength(2);
    expect(screen.getAllByText('99%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/does not modify the generated workflow/i)).toBeInTheDocument();
  });

  it('separates fact confidence, coverage, and overall reliability', () => {
    render(<DetectedProcessSummary summary={{ ...summary, coverage: { requiredDimensions: ['application:asana', 'decision'], detectedDimensions: ['application:asana'], missingDimensions: ['decision'], score: 0.5, formula: 'detected / required' }, reliability: { confidence: 0.9, coverage: 0.5, overall: 0.45, formula: 'confidence * coverage' } }} />);
    expect(screen.getByLabelText('Workflow intelligence reliability')).toHaveTextContent('Fact confidence90%');
    expect(screen.getByLabelText('Workflow intelligence reliability')).toHaveTextContent('Coverage50%');
    expect(screen.getByLabelText('Workflow intelligence reliability')).toHaveTextContent('Overall reliability45%');
  });
});
