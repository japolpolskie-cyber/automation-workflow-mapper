import { describe, expect, it } from 'vitest';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { PlannerContextBuilder } from './planner-context-builder.js';
import { PlannerPromptBuilder } from './planner-prompt-builder.js';

const scenarios = [
  ['Asana CRM', 'When an Asana task moves to Ready, retrieve task details and create a Google Drive folder.'],
  ['Drive and Sheets', 'For each Google Drive file, add one row to Google Sheets.'],
  ['Gmail and Outlook', 'When Gmail receives a message, validate it and send a reply through Outlook.'],
  ['Facebook leads', 'When Facebook Lead Ads receives a lead, find or create the CRM contact.'],
  ['Shopify', 'When Shopify receives an order, notify Slack without inventing an unsupported Shopify operation.'],
  ['Customer support', 'When a support ticket arrives, route it by severity and notify Slack.'],
  ['Recruitment', 'For each candidate, request approval and route approved and rejected candidates.'],
  ['HR onboarding', 'After HR approves a new employee, create onboarding tasks and a Drive folder.'],
  ['Finance follow-up', 'Send an Outlook invoice reminder every 7 days until payment, stop after 3 attempts, then escalate.'],
  ['Slack alert', 'When a critical event arrives by webhook, send a Slack channel notification.'],
  ['Generic API', 'Retrieve every API page, process each record, and aggregate all results.'],
  ['Attachments', 'For each Gmail attachment, upload the file to Google Drive.'],
  ['Scheduled reminder', 'Send a Gmail reminder every Monday until the customer responds.'],
  ['Approval', 'Request manager approval; if approved continue, otherwise notify the requester.'],
  ['Service routes', 'Route by service type to Cleaning, Maintenance, Repair, or Installation, then merge all routes.'],
  ['Iterator', 'For each approved item, validate and process the item.'],
  ['Create or update', 'Find the CRM record, then create or update it without duplicates.'],
  ['Follow-up', 'Send a Gmail follow-up every 2 days until response, stop after 3 attempts, then escalate.'],
  ['Retry', 'Upload one Drive file; retry up to 3 times only when the upload fails.'],
  ['Error handling', 'Call the generic API; after final failure notify Slack and end the workflow.'],
] as const;

describe('K4.1 20-scenario planner acceptance corpus', () => {
  it.each(scenarios)('%s creates a score-free, graph-constrained planner request', (_name, scope) => {
    const analysis = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-16T00:00:00.000Z'));
    const context = new PlannerContextBuilder().build(scope, 'n8n', analysis); const prompt = new PlannerPromptBuilder().build(context);
    expect(context.facts.length).toBeGreaterThan(0); expect(context.evidence.length).toBeGreaterThan(0);
    expect(prompt.user).not.toMatch(/"confidence"|"coverage"|"reliability"|"weight"/);
    const schema = JSON.stringify(prompt.outputSchema);
    expect(schema).toContain('"edges"'); expect(schema).toContain('"binaryConditions"'); expect(schema).toContain('"routers"');
    expect(schema).toContain('"merges"'); expect(schema).toContain('"loops"'); expect(schema).toContain('"retries"');
    expect(schema).toContain('"blockedByClarificationIds"');
  });
});
