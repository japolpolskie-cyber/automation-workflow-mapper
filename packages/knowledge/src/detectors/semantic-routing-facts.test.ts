import { describe, expect, it } from 'vitest';
import { extractSemanticRoutingFacts, semanticRoutingFactSchema } from './semantic-routing-facts.js';

describe('extractSemanticRoutingFacts', () => {
  it.each([
    ['Determine whether the request concerns Billing, Technical Support, or Account Access.', ['Billing', 'Technical Support', 'Account Access']],
    ['Identify which department applies: IT, Marketing, or Customer Support.', ['IT', 'Marketing', 'Customer Support']],
    ['Classify the message into Product Question, Service Issue, or Refund Request.', ['Product Question', 'Service Issue', 'Refund Request']],
    ['Assign cases according to priority levels: High, Medium, or Low.', ['High', 'Medium', 'Low']],
    ['Depending on the request type: New Order, Change Request, or Cancellation.', ['New Order', 'Change Request', 'Cancellation']],
  ])('extracts bounded semantic outcomes from %s', (sourceRequirement, outcomes) => {
    const facts = extractSemanticRoutingFacts(sourceRequirement);
    expect(facts).toHaveLength(1);
    expect(semanticRoutingFactSchema.parse(facts[0])).toEqual(facts[0]);
    expect(facts[0]?.outcomes).toEqual(outcomes);
  });

  it('joins an immediately following category-to-destination mapping and preserves exact offsets', () => {
    const sourceRequirement = 'First record the request. Review the message and determine whether it is related to billing, technical support, or account access. Send billing concerns to finance, technical support concerns to IT, and account access concerns to customer success. Then record completion.';
    const fact = extractSemanticRoutingFacts(sourceRequirement)[0]!;
    expect(fact.handlingEvidence).toMatch(/^Send billing concerns/);
    expect(sourceRequirement.slice(fact.sourceStart, fact.sourceEnd)).toBe(fact.evidenceText);
    expect(fact.evidenceText).toContain('customer success.');
    expect(fact.evidenceText).not.toContain('Then record completion');
  });

  it('is deterministic and does not mutate input', () => {
    const sourceRequirement = 'Determine whether the case concerns Sales, Support, or Finance.';
    const input = { sourceRequirement };
    const before = structuredClone(input);
    expect(extractSemanticRoutingFacts(input.sourceRequirement)).toEqual(extractSemanticRoutingFacts(input.sourceRequirement));
    expect(input).toEqual(before);
  });

  it.each([
    'Publish the post to Facebook, Instagram, and LinkedIn.',
    'Send the same alert to Slack, Email, and Teams.',
    'Send the same request to Legal, Finance, and Operations for review.',
    'Create the lead, notify sales, and update the spreadsheet.',
    'For each attachment, save the file, scan it, and archive it.',
    'The supported departments are IT, Marketing, and Customer Support.',
    'If approved, continue; otherwise stop.',
    'Determine whether the request concerns Billing or Support.',
    'Send billing concerns to Finance, support concerns to IT, and account concerns to Success.',
  ])('does not invent a routing fact for %s', (sourceRequirement) => {
    expect(extractSemanticRoutingFacts(sourceRequirement)).toEqual([]);
  });
});
