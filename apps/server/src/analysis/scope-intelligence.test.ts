import { describe, expect, it } from 'vitest';
import { calculateEvidenceConfidence, K3_RULE_VERSION, ScopeIntelligenceService } from './scope-intelligence.js';
import type { DeterministicEvidence } from '@awm/shared';

const benchmarkScope = `
Asana CRM automation:
When an Asana task is moved to the Ready to Start section, retrieve the Asana task details.
Search for the lead folder in Google Drive before creating the folder. Find the matching Asana subtask, then create or update the subtask.
Did the lead respond? If yes, stop follow-ups. If no, send a Gmail follow-up and check until the client responds.
Depending on the service type, route the work to Cleaning, Maintenance, Repair, or Installation.
For each approved attachment, upload it to Google Drive, then log every processed entry as a row in Google Sheets.
`;

const run = (scope = benchmarkScope, budget = 12_000) => new ScopeIntelligenceService(budget).analyze(scope, new Date('2026-07-16T00:00:00.000Z'));

describe('K3 deterministic scope intelligence', () => {
  it('detects the Asana CRM benchmark with exact source evidence', () => {
    const result = run();
    expect(result.facts.filter((fact) => fact.kind === 'application').map((fact) => fact.value)).toEqual(expect.arrayContaining(['Asana', 'Google Drive', 'Gmail', 'Google Sheets']));
    expect(result.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'decision', value: 'binary-condition' }),
      expect.objectContaining({ kind: 'decision', value: 'multi-route-decision' }),
      expect.objectContaining({ kind: 'pattern', value: 'Follow Up Until Response' }),
      expect.objectContaining({ kind: 'cardinality', value: 'collection' }),
    ]));
    for (const fact of result.facts) for (const item of fact.evidence.filter((evidence) => evidence.sourceLocation.start !== null)) {
      expect(benchmarkScope.slice(item.sourceLocation.start!, item.sourceLocation.end!)).toBe(item.evidenceText);
    }
  });

  it('gives explicit evidence precedence over linguistic evidence', () => {
    const explicit: DeterministicEvidence = { id: 'explicit', evidenceType: 'explicit', relationship: 'supporting', confidence: 1, weight: 5, ruleId: 'test.explicit', ruleVersion: K3_RULE_VERSION, ruleCategory: 'test', sourceLocation: { source: 'scope', start: 0, end: 6 }, evidenceText: 'single', explanation: 'Explicit.', relatedEvidenceIds: [], supportingFactIds: [] };
    const linguistic: DeterministicEvidence = { ...explicit, id: 'linguistic', evidenceType: 'linguistic', relationship: 'conflicting', confidence: 1, weight: 3, ruleId: 'test.linguistic' };
    const score = calculateEvidenceConfidence([explicit, linguistic]);
    expect(score.weightedSupport).toBeGreaterThan(score.weightedConflict);
    expect(score.precedence[0]).toBe('explicit');
  });

  it('detects linguistic collections but not a single record as an iterator signal', () => {
    expect(run('For each attachment, upload the file.').facts.some((fact) => fact.value === 'collection')).toBe(true);
    const single = run('Retrieve one lead record and update it.');
    expect(single.facts.some((fact) => fact.value === 'single')).toBe(true);
    expect(single.knowledgeContext.retrieved.some((item) => item.id === 'iterator')).toBe(false);
  });

  it.each([
    ['data-retrieval', 'Retrieve the Asana task details before continuing.'],
    ['data-retrieval', 'Search Google Calendar for conflicting events.'],
    ['notification', 'Notify the Slack channel when processing completes.'],
    ['notification', 'Send a rejection notice to the requester.'],
    ['logging', 'Log every processed attachment in Google Sheets.'],
    ['logging', 'Add one row to Google Sheets for the payment.'],
    ['validation', 'Validate the email address before creating the record.'],
    ['validation', 'Verify inventory before fulfilling the order.'],
    ['delay', 'Wait two days before sending a reminder.'],
    ['delay', 'Wait until two hours before the appointment.'],
  ])('promotes %s knowledge from platform-oriented operation language', (canonicalFunction, scope) => {
    const result = run(scope);
    expect(result.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'workflow_function', value: canonicalFunction }),
    ]));
    expect(result.knowledgeContext.retrieved).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'canonical_function', id: canonicalFunction }),
    ]));
  });

  it.each([
    ['Request human approval before processing the invoice.'],
    ['The finance manager must approve or reject the purchase request.'],
    ['When an onboarding task is approved, create the customer folder.'],
  ])('recognizes explicit approval workflow language without changing the compiler', (scope) => {
    const result = run(scope);
    expect(result.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'workflow_function', value: 'human-approval' }),
    ]));
  });

  it.each([
    ['If the lead is qualified, update it; otherwise notify the owner.'],
    ['Did the client reply? If yes continue; if no stop.'],
    ['If the operation succeeded continue, otherwise handle the failure.'],
    ['If the request status is approved continue; else stop.'],
  ])('recognizes explicit two-outcome business decisions', (scope) => {
    const result = run(scope);
    expect(result.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'decision', value: 'binary-condition' }),
      expect.objectContaining({ kind: 'workflow_function', value: 'binary-condition' }),
    ]));
  });

  it('keeps conflicting cardinality evidence visible and requests clarification', () => {
    const result = run('Process each attachment and a single attachment.');
    const cardinality = result.facts.find((fact) => fact.kind === 'cardinality')!;
    expect(cardinality.evidence.some((item) => item.relationship === 'conflicting')).toBe(true);
    expect(cardinality.confidence.weightedConflict).toBeGreaterThan(0);
    expect(result.clarifications.some((item) => item.id.startsWith('clarification-collection-versus-single'))).toBe(true);
  });

  it('creates precise missing follow-up clarifications without assumptions', () => {
    const result = run('Send a Gmail follow-up and check until the client responds.');
    expect(result.clarifications.map((item) => item.id)).toEqual(expect.arrayContaining(['clarification-follow-up-interval', 'clarification-maximum-follow-up-attempts', 'clarification-escalation-policy']));
    expect(result.clarifications.some((item) => item.id === 'clarification-communication-channel')).toBe(false);
    expect(result.clarifications.every((item) => item.evidence.some((evidence) => evidence.evidenceType === 'missing_information'))).toBe(true);
  });

  it('traces derived pattern evidence to its supporting rule evidence', () => {
    const pattern = run().facts.find((fact) => fact.value === 'Follow Up Until Response')!;
    const derived = pattern.evidence.find((item) => item.evidenceType === 'derived')!;
    expect(derived.relatedEvidenceIds.length).toBeGreaterThanOrEqual(2);
    expect(derived.relatedEvidenceIds.every((id) => pattern.evidence.some((item) => item.id === id))).toBe(true);
    expect(derived.supportingFactIds.length).toBeGreaterThan(0);
  });

  it('produces reproducible scores and versioned rules', () => {
    const first = run(); const second = run();
    expect(second).toEqual(first);
    expect(first.facts.every((fact) => fact.confidence.scoringRuleVersion === K3_RULE_VERSION && fact.evidence.every((item) => item.ruleVersion === K3_RULE_VERSION))).toBe(true);
  });

  it('retrieves only relevant knowledge inside the configured budget', () => {
    const result = run(benchmarkScope, 3_000);
    expect(result.knowledgeContext.estimatedCharacters).toBeLessThanOrEqual(3_000);
    expect(result.knowledgeContext.maximumCharacters).toBe(3_000);
    expect(result.knowledgeContext.retrieved.some((item) => item.id === 'asana')).toBe(true);
    expect(result.knowledgeContext.retrieved.some((item) => item.id === 'slack')).toBe(false);
    expect(result.knowledgeContext.truncated).toBe(true);
  });

  it.each([
    ['Follow Up Until Response', 'Send a follow-up reminder, wait, and check until response.'],
    ['Create or Update Record', 'Find the record before create or update.'],
    ['Process Approved Collection', 'After approval, process each attachment in the collection.'],
    ['Scheduled Reminder', 'Send a reminder on a weekly schedule.'],
    ['Deduplicate Before Create', 'Search for an existing item before creating it to prevent a duplicate.'],
    ['Service-Based Routing', 'Route by service type to Cleaning, Maintenance, and Repair.'],
  ])('matches the versioned %s pattern from multiple deterministic signals', (title, scope) => {
    const result = run(scope);
    const pattern = result.facts.find((item) => item.kind === 'pattern' && item.value === title);
    expect(pattern).toBeDefined();
    expect(pattern?.evidence.filter((item) => item.evidenceType === 'pattern').length).toBeGreaterThanOrEqual(2);
  });
});
