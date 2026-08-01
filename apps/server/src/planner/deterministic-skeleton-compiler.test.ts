import { describe, expect, it } from 'vitest';
import type { Platform } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { PlannerContextBuilder } from './planner-context-builder.js';
import { DeterministicSkeletonCompiler } from './deterministic-skeleton-compiler.js';

const scenarios: Array<{ name: string; platform: Platform; scope: string }> = [
  { name: 'Asana CRM', platform: 'n8n', scope: 'Build five Asana CRM lifecycle automations: when a lead becomes Ready create its Google Drive folder and Asana subtasks; when No Response follow up until response; when Quoted send weekly quote reminders; when Approved send onboarding instructions; when Paid and Closed send a service recommendation. Log lifecycle activity in Google Sheets. Preserve missing follow-up interval, attempt limit, owner, and escalation policy as questions.' },
  { name: 'Follow-up loop', platform: 'n8n', scope: 'When an Asana lead enters No Response, follow up until response. Stop when they respond. The interval, attempt limit, channel, owner, and escalation policy are not specified.' },
  { name: 'Approved collection', platform: 'make', scope: 'After a manager approves a collection of entries, iterate every approved entry, add one row per entry to Google Sheets, aggregate the results, and notify Slack when processing is complete.' },
  { name: 'Service routing', platform: 'n8n', scope: 'When a qualified CRM lead selects one of three service types, route to Cleaning, Maintenance, or Repair. Send a different Gmail email for each service, merge the routes, and log the result in Google Sheets.' },
  { name: 'Attachments', platform: 'make', scope: 'When Gmail receives a message with attachments, iterate through each attachment, upload every file to Google Drive, aggregate the uploaded links, and notify Slack.' },
  { name: 'Unsupported Shopify', platform: 'zapier', scope: 'When a Shopify order is paid, interpret the fulfillment request and notify Slack. Do not invent a Shopify operation.' },
];

describe('P4 deterministic skeleton compiler', () => {
  const intelligence = new ScopeIntelligenceService();
  const contextBuilder = new PlannerContextBuilder();
  const compiler = new DeterministicSkeletonCompiler();

  it.each(scenarios)('compiles complete topology for $name', ({ platform, scope }) => {
    const analysis = intelligence.analyze(scope, new Date('2026-07-16T00:00:00.000Z'));
    const context = contextBuilder.build(scope, platform, analysis);
    const result = compiler.compile(context);
    expect(result.issues).toEqual([]);
    expect(result.plan.nodes[0]?.canonicalFunctionId).toBe('trigger');
    expect(result.plan.nodes.at(-1)?.canonicalFunctionId).toBe('end');
    expect(result.plan.edges.length).toBeGreaterThan(0);
    expect(result.durationMs).toBeLessThan(100);
  });

  it('compiles TRUE/FALSE and merge topology for create-or-update', () => {
    const scope = 'Search for an existing CRM lead, create it when absent or update it when present, then continue.';
    const context = contextBuilder.build(scope, 'n8n', intelligence.analyze(scope, new Date('2026-07-16T00:00:00.000Z')));
    const result = compiler.compile(context);
    expect(result.issues).toEqual([]);
    expect(result.plan.binaryConditions).toHaveLength(1);
    expect(result.plan.merges).toHaveLength(1);
    const labels = result.plan.edges.map((edge) => edge.label);
    expect(labels).toEqual(expect.arrayContaining(['TRUE', 'FALSE']));
  });

  it('compiles business loops without technical retry boundaries', () => {
    const scope = 'Follow up every 7 days until the lead responds, stopping after 3 attempts.';
    const context = contextBuilder.build(scope, 'n8n', intelligence.analyze(scope, new Date('2026-07-16T00:00:00.000Z')));
    const result = compiler.compile(context);
    expect(result.issues).toEqual([]);
    expect(result.plan.loops).toHaveLength(1);
    expect(result.plan.retries).toHaveLength(0);
    expect(result.plan.edges.map((edge) => edge.label)).toEqual(expect.arrayContaining(['LOOP ENTRY', 'LOOP BACK', 'LOOP EXIT']));
  });

  it('compiles collection iteration and aggregation separately from branch merge', () => {
    const scope = 'After a manager approves all attachments, process each attachment and aggregate the results.';
    const context = contextBuilder.build(scope, 'make', intelligence.analyze(scope, new Date('2026-07-16T00:00:00.000Z')));
    const result = compiler.compile(context);
    expect(result.issues).toEqual([]);
    expect(result.plan.nodes.some((node) => node.canonicalFunctionId === 'iterator')).toBe(true);
    expect(result.plan.nodes.some((node) => node.canonicalFunctionId === 'aggregator')).toBe(true);
    expect(result.plan.nodes.some((node) => node.canonicalFunctionId === 'merge')).toBe(true);
  });

  it('compiles technical retry separately from business loops', () => {
    const scope = 'If the generic API request fails with a technical error, retry up to 3 attempts and then run the error handler.';
    const analysis = intelligence.analyze(scope, new Date('2026-07-16T00:00:00.000Z'));
    const context = contextBuilder.build(scope, 'n8n', analysis);
    context.facts.push({ id: 'fact-retry', kind: 'workflow_function', value: 'retry', explanation: 'Explicit technical retry.', entityId: null, evidenceIds: [context.evidence[0]!.id] });
    const result = compiler.compile(context);
    expect(result.issues).toEqual([]);
    expect(result.plan.retries).toHaveLength(1);
    expect(result.plan.retries[0]?.maximumAttempts).toBe(3);
    expect(result.plan.loops).toHaveLength(0);
  });

  it('compiles approved and rejected human-approval paths', () => {
    const scope = 'Request manager approval before onboarding.';
    const analysis = intelligence.analyze(scope, new Date('2026-07-16T00:00:00.000Z'));
    const context = contextBuilder.build(scope, 'n8n', analysis);
    context.evidence.push({ id: 'evidence-approval', evidenceType: 'explicit', ruleId: 'test.approval', ruleVersion: '1.0.0', text: 'manager approval', explanation: 'Explicit approval.', sourceStart: 8, sourceEnd: 24 });
    context.facts.push({ id: 'fact-approval', kind: 'workflow_function', value: 'human-approval', explanation: 'Explicit approval.', entityId: null, evidenceIds: ['evidence-approval'] });
    const result = compiler.compile(context);
    expect(result.issues).toEqual([]);
    expect(result.plan.binaryConditions).toHaveLength(1);
    expect(result.plan.edges.map((edge) => edge.label)).toEqual(expect.arrayContaining(['TRUE', 'FALSE']));
  });

  it('preserves both stated clause-level outcomes and their decision connections', () => {
    const scope = 'If the payment succeeds, send a receipt; otherwise notify finance.';
    const context = contextBuilder.build(scope, 'n8n', intelligence.analyze(scope, new Date('2026-07-16T00:00:00.000Z')));
    const result = compiler.compile(context);
    const binary = result.plan.binaryConditions[0];
    expect(binary).toBeDefined();
    const trueEdge = result.plan.edges.find((edge) => edge.id === binary?.trueEdgeId);
    const falseEdge = result.plan.edges.find((edge) => edge.id === binary?.falseEdgeId);
    expect(trueEdge).toMatchObject({ label: 'TRUE', condition: 'the payment succeeds: send a receipt' });
    expect(falseEdge).toMatchObject({ label: 'FALSE', condition: 'Otherwise: notify finance' });
    expect(result.plan.nodes.find((node) => node.id === trueEdge?.target)?.title).toBe('send a receipt');
    expect(result.plan.nodes.find((node) => node.id === falseEdge?.target)?.title).toBe('notify finance');
  });

  it('preserves classified verb functions in the generated skeleton', () => {
    const scope = 'Search HubSpot for the matching contact. Validate the invoice fields. Notify the account manager in Slack. Log the result in Google Sheets.';
    const context = contextBuilder.build(scope, 'n8n', intelligence.analyze(scope, new Date('2026-07-16T00:00:00.000Z')));
    const result = compiler.compile(context);
    expect(result.issues).toEqual([]);
    expect(result.plan.nodes.map((node) => node.canonicalFunctionId)).toEqual(expect.arrayContaining([
      'data-retrieval',
      'validation',
      'notification',
      'logging',
    ]));
    expect(context.facts.filter((fact) => fact.kind === 'application').map((fact) => fact.value)).toEqual(expect.arrayContaining(['HubSpot', 'Slack', 'Google Sheets']));
  });

  const compileCollection = (scope: string) => compiler.compile(contextBuilder.build(scope, 'n8n', intelligence.analyze(scope, new Date('2026-07-16T00:00:00.000Z'))));
  const indexOfFunction = (result: ReturnType<typeof compileCollection>, functionId: string) => result.plan.nodes.findIndex((node) => node.canonicalFunctionId === functionId);

  it('preserves retrieval before iterator processing', () => {
    const result = compileCollection('Retrieve all inventory records, iterate each item, and process each item.');
    expect(indexOfFunction(result, 'data-retrieval')).toBeGreaterThan(-1);
    expect(indexOfFunction(result, 'data-retrieval')).toBeLessThan(indexOfFunction(result, 'iterator'));
    expect(indexOfFunction(result, 'iterator')).toBeLessThan(indexOfFunction(result, 'action'));
  });

  it('preserves the nearest detected retrieval application in the collection node title', () => {
    const result = compileCollection('Retrieve approved social posts from Google Sheets, iterate every post, and schedule it through a Generic API.');
    expect(result.plan.nodes.find((node) => node.canonicalFunctionId === 'data-retrieval')?.title).toMatch(/Google Sheets/i);
  });

  it('preserves retrieval, iterator processing, and required aggregation in order', () => {
    const result = compileCollection('Retrieve all inventory records, iterate each item, process each item, and aggregate the results.');
    expect(indexOfFunction(result, 'data-retrieval')).toBeLessThan(indexOfFunction(result, 'iterator'));
    expect(indexOfFunction(result, 'iterator')).toBeLessThan(indexOfFunction(result, 'aggregator'));
  });

  it('places completion notification after required aggregation without duplication', () => {
    const result = compileCollection('Retrieve all Gmail attachments, iterate each attachment, process each attachment, aggregate the results, then notify Slack when processing is complete.');
    expect(indexOfFunction(result, 'aggregator')).toBeLessThan(indexOfFunction(result, 'notification'));
    expect(result.plan.nodes.filter((node) => node.canonicalFunctionId === 'notification')).toHaveLength(1);
    expect(result.plan.nodes.find((node) => node.canonicalFunctionId === 'data-retrieval')?.title).toMatch(/Gmail attachments/i);
    expect(result.plan.nodes.find((node) => node.canonicalFunctionId === 'notification')?.title).toMatch(/notify Slack/i);
  });

  it('does not add notification to a collection flow without notification evidence', () => {
    const result = compileCollection('Retrieve all Gmail attachments, iterate each attachment, process each attachment, and aggregate the results.');
    expect(result.plan.nodes.some((node) => node.canonicalFunctionId === 'notification')).toBe(false);
  });

  it('does not force aggregation when collection results do not require recombination', () => {
    const result = compileCollection('Retrieve all Outlook messages, iterate each message, and process each message.');
    expect(result.plan.nodes.some((node) => node.canonicalFunctionId === 'aggregator')).toBe(false);
    expect(indexOfFunction(result, 'data-retrieval')).toBeLessThan(indexOfFunction(result, 'iterator'));
    const iterator = result.plan.nodes.find((node) => node.canonicalFunctionId === 'iterator')!;
    expect(result.plan.edges.some((edge) => edge.source === iterator.id && edge.label === 'DONE')).toBe(true);
    expect(result.issues).toEqual([]);
  });
});
