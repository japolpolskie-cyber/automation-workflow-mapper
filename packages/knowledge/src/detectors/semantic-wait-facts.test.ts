import { describe, expect, it } from 'vitest';
import { extractSemanticWaitFacts, semanticWaitFactSchema } from './semantic-wait-facts.js';

describe('extractSemanticWaitFacts', () => {
  it.each([
    ['If approval is not received within two business days, keep the request pending.', 'until-approval', 'approval within two business days'],
    ['Allow the customer 48 hours to reply before escalating the case.', 'until-response', 'customer reply within 48 hours'],
    ['The request remains pending until the manager responds.', 'until-response', 'manager responds'],
    ['Do not process the refund before manager approval.', 'until-approval', 'manager approval'],
    ['Continue once the signed agreement has been received.', 'until-event', 'the signed agreement received'],
    ['Hold the invoice until its due date.', 'until-date', 'its due date'],
    ['After seven days without a response, notify the account owner.', 'until-response', 'response within seven days'],
  ])('extracts a bounded semantic Wait fact from %s', (sourceRequirement, waitType, boundaryDescription) => {
    const fact = extractSemanticWaitFacts(sourceRequirement)[0]!;
    expect(semanticWaitFactSchema.parse(fact)).toEqual(fact);
    expect(fact).toMatchObject({ waitType, boundaryDescription, completeness: 'complete' });
  });

  it('preserves timeout handling without inventing values', () => {
    expect(extractSemanticWaitFacts('Allow the customer 48 hours to reply before escalating the case.')[0]).toMatchObject({ durationDescription: '48 hours', eventDescription: 'customer reply', timeoutOutcome: 'escalate the case' });
  });

  it('uses nearby explicit approval context while keeping Wait evidence scoped to its own sentence', () => {
    const sourceRequirement = 'Before any refund is issued, a manager must approve the request. If approval is not received within two business days, keep the request pending and notify the case owner.';
    const fact = extractSemanticWaitFacts(sourceRequirement)[0]!;
    expect(fact.eventDescription).toBe('manager approval');
    expect(fact.evidenceText).toMatch(/^If approval/);
    expect(sourceRequirement.slice(fact.sourceStart, fact.sourceEnd)).toBe(fact.evidenceText);
  });

  it('is deterministic and does not mutate its input', () => {
    const input = { sourceRequirement: 'After seven days without a response, notify the account owner.' };
    const before = structuredClone(input);
    expect(extractSemanticWaitFacts(input.sourceRequirement)).toEqual(extractSemanticWaitFacts(input.sourceRequirement));
    expect(input).toEqual(before);
  });

  it.each([
    'Run every Monday.',
    'Start at 9 AM each day.',
    'Check every five minutes until complete.',
    'Poll the payment status every minute.',
    'Send reminders every two days until the form is submitted.',
    'Retry the failed request after ten seconds.',
    'The customer replied after two days.',
    'Hold this for later.',
  ])('rejects non-Wait or unbounded timing: %s', (sourceRequirement) => {
    expect(extractSemanticWaitFacts(sourceRequirement)).toEqual([]);
  });
});
