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

  it('assembles the natural Router acceptance challenge with no duplicate decision', () => {
    const sourceRequirement = 'When a customer submits a support request, review the message and determine whether it is related to billing, technical support, or account access. Send billing concerns to the finance team, technical concerns to the IT support queue, and account-access concerns to the customer success team.';
    const brief = assembleDraftWorkflowBrief({ sourceRequirement });
    expect(parseCanonicalWorkflowBrief(brief)).toEqual(brief);
    expect(brief.capabilitySuggestions.map((item) => item.capabilityType)).toEqual(['multi-route-decision']);
    expect(brief.decisions).toHaveLength(1);
    expect(brief.routes.map((route) => route.label)).toEqual(['Billing', 'Technical Support', 'Account Access']);
  });

  it('detects Router from its own scope in the longer requirement without expanding Approval behavior', () => {
    const sourceRequirement = 'When a customer submits a support request, review the message and determine whether it is related to billing, technical support, or account access. Send billing concerns to the finance team, technical concerns to the IT support queue, and account-access concerns to the customer success team. Before any refund is issued, a manager must approve the request.';
    const brief = assembleDraftWorkflowBrief({ sourceRequirement });
    expect(parseCanonicalWorkflowBrief(brief)).toEqual(brief);
    expect(brief.capabilitySuggestions.map((item) => item.capabilityType)).toContain('multi-route-decision');
    expect(brief.decisions).toHaveLength(1);
    expect(brief.routes.slice(0, 3).map((route) => route.label)).toEqual(['Billing', 'Technical Support', 'Account Access']);
  });

  it('creates a Binary Decision suggestion with its semantic branches', () => {
    const brief = assembleDraftWorkflowBrief({ sourceRequirement: 'If payment succeeds, send a receipt; otherwise notify finance.' });
    expect(brief.capabilitySuggestions[0]?.capabilityType).toBe('binary-decision');
    expect(brief.routes.map((route) => route.label)).toEqual(['Success', 'Failure']);
    expect(brief.decisions[0]).toMatchObject({ decisionType: 'binary', fallbackRouteId: brief.routes[1]?.id });
  });

  it('creates a complete Wait entity only when its boundary is sufficient', () => {
    const brief = assembleDraftWorkflowBrief({ sourceRequirement: 'Wait three days before following up.' });
    expect(parseCanonicalWorkflowBrief(brief)).toEqual(brief);
    expect(brief.capabilitySuggestions[0]?.capabilityType).toBe('wait');
    expect(brief.waits[0]).toMatchObject({ waitType: 'duration', boundaryDescription: 'three days', durationDescription: 'three days', resumeActionId: brief.actions[0]?.id });
  });

  it('materializes a natural approval-timeout Wait without inventing a new Approval', () => {
    const sourceRequirement = 'Before any refund is issued, a manager must approve the request. If approval is not received within two business days, keep the request pending and notify the case owner.';
    const brief = assembleDraftWorkflowBrief({ sourceRequirement });
    expect(parseCanonicalWorkflowBrief(brief)).toEqual(brief);
    expect(brief.waits[0]).toMatchObject({ waitType: 'until-approval', boundaryDescription: 'manager approval within two business days', eventDescription: 'manager approval within two business days' });
    expect(brief.waits[0]?.description).toMatch(/keep the request pending and notify the case owner/i);
  });

  it('materializes the bounded customer-response Wait and timeout meaning', () => {
    const brief = assembleDraftWorkflowBrief({ sourceRequirement: 'Allow the customer 48 hours to reply before escalating the case.' });
    expect(parseCanonicalWorkflowBrief(brief)).toEqual(brief);
    expect(brief.waits[0]).toMatchObject({ waitType: 'until-response', boundaryDescription: 'customer reply within 48 hours' });
    expect(brief.waits[0]?.description).toMatch(/escalate the case/i);
  });

  it('keeps an incomplete Wait as a suggestion with clarification and no invalid entity', () => {
    const brief = assembleDraftWorkflowBrief({ sourceRequirement: 'Wait until ready.' });
    expect(brief.capabilitySuggestions[0]?.capabilityType).toBe('wait');
    expect(brief.waits).toEqual([]);
    expect(brief.clarificationQuestions).toHaveLength(1);
    expect(brief.reviewState.status).toBe('needs-clarification');
  });

  it('keeps incomplete Approval as a suggestion without invented references', () => {
    const brief = assembleDraftWorkflowBrief({ sourceRequirement: 'Send the proposal to the manager for approval.' });
    expect(parseCanonicalWorkflowBrief(brief)).toEqual(brief);
    expect(brief.capabilitySuggestions[0]).toMatchObject({ capabilityType: 'approval', relatedEntityIds: [] });
    expect(brief.approvals).toEqual([]);
    expect(brief.actors).toEqual([]);
    expect(brief.clarificationQuestions[0]?.question).toMatch(/approved or rejected/i);
  });

  it('materializes Approval only when approver, subject, and both outcomes are explicit', () => {
    const brief = assembleDraftWorkflowBrief({ sourceRequirement: 'Wait for the client to approve or reject the design.' });
    expect(parseCanonicalWorkflowBrief(brief)).toEqual(brief);
    expect(brief.capabilitySuggestions.map((item) => item.capabilityType)).toEqual(['approval']);
    expect(brief.approvals[0]).toMatchObject({ approverActorId: brief.actors[0]?.id, requestActionId: brief.actions[0]?.id });
    expect(brief.routes.map((route) => route.label)).toEqual(['Approved', 'Rejected']);
    expect(brief.waits).toEqual([]);
  });

  it('preserves a distinct explicit resume boundary alongside Approval', () => {
    const brief = assembleDraftWorkflowBrief({ sourceRequirement: 'Resume after manager approval.' });
    expect(brief.capabilitySuggestions.map((item) => item.capabilityType)).toEqual(['wait']);
    expect(brief.waits[0]?.waitType).toBe('until-approval');
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
    expect(first.reviewState.status).not.toBe('locked');
  });
});
