import { describe, expect, it } from 'vitest';
import { ScopeIntelligenceService } from './scope-intelligence.js';

const analyze = (scope: string) => new ScopeIntelligenceService().analyze(scope, new Date('2026-07-16T00:00:00.000Z'));
const apps = (scope: string) => analyze(scope).facts.filter((fact) => fact.kind === 'application').map((fact) => fact.value);
const functions = (scope: string) => analyze(scope).facts.filter((fact) => fact.kind === 'workflow_function').map((fact) => fact.value);

describe('K3.1 real-world acceptance suite', () => {
  it.each([
    ['Facebook lead intake', 'When Facebook Lead Ads receives a lead, create a HubSpot contact and notify Slack.', ['Facebook Lead Ads', 'HubSpot', 'Slack']],
    ['Asana document setup', 'When an Asana task moves section, find or create its Google Drive folder.', ['Asana', 'Google Drive']],
    ['Gmail sheet log', 'When Gmail receives an email, create one row in Google Sheets.', ['Gmail', 'Google Sheets']],
    ['Shopify fulfillment', 'When Shopify receives an order, notify Slack and update HubSpot.', ['Shopify', 'Slack', 'HubSpot']],
    ['Accounting handoff', 'Create an invoice in Xero and send it through Outlook.', ['Xero', 'Outlook']],
    ['Support sync', 'Update a Salesforce record and create a ClickUp task.', ['Salesforce', 'ClickUp']],
    ['File intake', 'Upload each Dropbox file and log every file in Airtable.', ['Dropbox', 'Airtable']],
    ['SMS follow-up', 'Send a Twilio SMS, then update GoHighLevel.', ['Twilio', 'GoHighLevel']],
  ])('%s resolves the complete registry', (_name, scope, expected) => expect(apps(scope)).toEqual(expect.arrayContaining(expected)));

  it.each([
    ['filter', 'Continue only when the lead is valid; unmatched records stop.'],
    ['merge', 'Merge all branches after the service routes finish.'],
    ['aggregator', 'Aggregate all item results into one summary.'],
    ['retry', 'Retry the Google Drive upload when it fails.'],
    ['error-handler', 'When the upload fails, notify the owner.'],
    ['delay', 'Wait for 2 days before sending the Gmail reminder.'],
    ['loop', 'Repeat the Gmail follow-up until the customer responds.'],
    ['iterator', 'For each approved attachment, upload the file to Google Drive.'],
  ])('detects %s as a first-class function', (expected, scope) => expect(functions(scope)).toContain(expected));

  it('does not confuse schedule frequency with collection cardinality', () => {
    const result = analyze('Send one Gmail reminder every 2 days.');
    expect(result.facts.some((fact) => fact.kind === 'cardinality' && fact.value === 'collection')).toBe(false);
    expect(result.facts.some((fact) => fact.value === 'iterator')).toBe(false);
  });

  it('keeps cardinality scoped to the named entity', () => {
    const result = analyze('For each attachment, upload one file and create a single Asana task.');
    const collection = result.facts.find((fact) => fact.kind === 'cardinality' && fact.value === 'collection');
    expect(collection?.subject?.entityId).toBe('attachment');
    expect(result.facts.filter((fact) => fact.kind === 'cardinality' && fact.value === 'single').map((fact) => fact.subject?.entityId)).toEqual(expect.arrayContaining(['file', 'task']));
  });

  it('separates Approved status from an approval process', () => {
    expect(analyze("When the Asana status becomes Approved, send Gmail.").clarifications.some((item) => item.id === 'clarification-approval-owner')).toBe(false);
    expect(analyze('Request approval before sending Gmail.').clarifications.some((item) => item.id === 'clarification-approval-owner')).toBe(true);
  });

  it('recognizes explicit follow-up policies and false paths', () => {
    const result = analyze('Send a Gmail follow-up every 2 days until response. Stop after 3 attempts and escalate to the manager. If the lead replied, stop; otherwise continue.');
    expect(result.clarifications.map((item) => item.id)).not.toEqual(expect.arrayContaining(['clarification-follow-up-interval', 'clarification-maximum-follow-up-attempts', 'clarification-escalation-policy', 'clarification-ambiguous-false-path']));
  });

  it('keeps confidence, coverage, and reliability separately inspectable', () => {
    const result = analyze('When Facebook Lead Ads receives a lead, create a HubSpot contact and notify Slack.');
    expect(result.coverage).toBeDefined(); expect(result.reliability).toBeDefined();
    expect(result.reliability?.overall).toBe(Number(((result.reliability?.confidence ?? 0) * (result.reliability?.coverage ?? 0)).toFixed(4)));
  });

  it('links evidence to clause and step locations', () => {
    const result = analyze('When a lead arrives, create a task, then notify Slack.');
    expect(result.facts.flatMap((fact) => fact.evidence).filter((item) => item.sourceLocation.start !== null).every((item) => item.sourceLocation.stepId)).toBe(true);
  });

  it('retrieves semantically matched operations without unrelated application packs', () => {
    const result = analyze('Find an Asana task and create a Google Drive folder.');
    const ids = result.knowledgeContext.retrieved.map((item) => item.id);
    expect(ids.some((id) => id.startsWith('asana.'))).toBe(true);
    expect(ids.some((id) => id.startsWith('google-drive.'))).toBe(true);
    expect(ids.some((id) => id.startsWith('slack.'))).toBe(false);
  });

  it('preserves deterministic reproducibility', () => {
    const scope = 'For each Shopify order, log one row in Google Sheets and notify Slack.';
    expect(analyze(scope)).toEqual(analyze(scope));
  });

  it('runs the expanded Asana CRM benchmark with improved completeness', () => {
    const result = analyze('When an Asana lead moves to Ready, retrieve the task. Find or create a Google Drive folder. For each attachment upload the file. Did the lead respond? If no, send Gmail every 2 days, stop after 3 attempts, then escalate to the owner. Route by service type to Cleaning, Maintenance, Repair, or Installation. Merge all routes and log one row in Google Sheets.');
    expect(result.coverage?.score).toBeGreaterThanOrEqual(0.85);
    expect(result.facts.map((fact) => fact.value)).toEqual(expect.arrayContaining(['binary-condition', 'multi-route-decision', 'iterator', 'merge']));
    expect(result.clarifications.map((item) => item.id)).not.toEqual(expect.arrayContaining(['clarification-follow-up-interval', 'clarification-maximum-follow-up-attempts', 'clarification-escalation-policy']));
  });
});
