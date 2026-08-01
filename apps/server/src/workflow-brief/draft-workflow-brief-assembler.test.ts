import { parseCanonicalWorkflowBrief } from '@awm/shared';
import { describe, expect, it } from 'vitest';
import { assembleDraftWorkflowBrief } from './draft-workflow-brief-assembler.js';

const forbiddenKeys = /^(?:platform|provider|runtime|model|prompt|canvasId|nodeId|credentials)$/i;
const collectKeys = (value: unknown): string[] => {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(collectKeys);
  return Object.entries(value).flatMap(([key, nested]) => [key, ...collectKeys(nested)]);
};

describe('assembleDraftWorkflowBrief', () => {
  it('returns a valid unlocked draft with explicit scaffolding when no decision is detected', () => {
    const brief = assembleDraftWorkflowBrief({ sourceRequirement: 'Receive a website enquiry and notify the sales team.' });
    expect(parseCanonicalWorkflowBrief(brief)).toEqual(brief);
    expect(brief.reviewState).toMatchObject({ status: 'draft', version: 1 });
    expect(brief.reviewState).not.toHaveProperty('lockedAt');
    expect(brief.capabilitySuggestions).toEqual([]);
    expect(brief.triggers[0]?.description).toMatch(/draft scaffolding.*not an extracted client trigger/i);
    expect(brief.actions[0]?.description).toMatch(/draft scaffolding.*not an extracted client action/i);
    expect(brief.warnings.join(' ')).toMatch(/scaffolding/i);
  });

  it('creates a Router suggestion and preserves department labels', () => {
    const brief = assembleDraftWorkflowBrief({ sourceRequirement: 'Route requests to IT, Marketing, or Customer Support.' });
    expect(brief.capabilitySuggestions).toHaveLength(1);
    expect(brief.capabilitySuggestions[0]?.capabilityType).toBe('multi-route-decision');
    expect(brief.routes.map((route) => route.label)).toEqual(['IT', 'Marketing', 'Customer Support']);
    expect(brief.decisions[0]?.decisionType).toBe('multi-route');
  });

  it('creates a Binary Decision suggestion with its semantic branches', () => {
    const brief = assembleDraftWorkflowBrief({ sourceRequirement: 'If payment succeeds, send a receipt; otherwise notify finance.' });
    expect(brief.capabilitySuggestions[0]?.capabilityType).toBe('binary-decision');
    expect(brief.routes.map((route) => route.label)).toEqual(['Success', 'Failure']);
    expect(brief.decisions[0]).toMatchObject({ decisionType: 'binary', fallbackRouteId: brief.routes[1]?.id });
  });

  it('turns ambiguous routing into open clarification and needs-clarification state', () => {
    const brief = assembleDraftWorkflowBrief({ sourceRequirement: 'Route enquiries to Sales, Enterprise Sales, or Support.' });
    expect(brief.reviewState.status).toBe('needs-clarification');
    expect(brief.clarificationQuestions.length).toBeGreaterThan(0);
    expect(brief.clarificationQuestions.every((question) => question.status === 'open')).toBe(true);
    expect(brief.decisions[0]?.conditionDescription).toBe('department');
  });

  it('marks a genuinely missing routing condition as requiring clarification', () => {
    const brief = assembleDraftWorkflowBrief({ sourceRequirement: 'Route cases to Alpha, Beta, or Gamma.' });
    expect(brief.decisions[0]?.conditionDescription).toBe('Routing condition requires clarification');
    expect(brief.routes.every((route) => route.condition.startsWith('Condition requires clarification'))).toBe(true);
  });

  it('contains no platform, provider, canvas, or runtime fields', () => {
    const brief = assembleDraftWorkflowBrief({ sourceRequirement: 'Route requests to IT, Marketing, or Customer Support.' });
    expect(collectKeys(brief).filter((key) => forbiddenKeys.test(key))).toEqual([]);
    expect(JSON.stringify(brief)).not.toMatch(/\b(?:n8n|make\.com|zapier|ollama|reactflow)\b/i);
  });

  it('does not mutate input and produces deterministic IDs', () => {
    const input = { sourceRequirement: 'If payment succeeds, send a receipt; otherwise notify finance.', name: 'Payments' };
    const before = structuredClone(input);
    const first = assembleDraftWorkflowBrief(input);
    const second = assembleDraftWorkflowBrief(structuredClone(input));
    expect(input).toEqual(before);
    expect(first).toEqual(second);
  });
});
