import { describe, expect, it } from 'vitest';
import { leadQualificationWorkflow, type Platform } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { P3ShadowExperimentService } from './p3-shadow-experiment.js';
import { OllamaPlannerStageRunnerFactory } from './p3-ollama-stage-runner.js';

const coreScenarios: ReadonlyArray<{ name: string; platform: Platform; scope: string }> = [
  { name: 'Asana CRM five lifecycles', platform: 'n8n', scope: 'Build five Asana CRM lifecycle automations: when a lead becomes Ready create its Google Drive folder and Asana subtasks; when No Response follow up until response; when Quoted send weekly quote reminders; when Approved send onboarding instructions; when Paid and Closed send a service recommendation. Log lifecycle activity in Google Sheets. Preserve missing follow-up interval, attempt limit, owner, and escalation policy as questions.' },
  { name: 'No Response follow-up', platform: 'n8n', scope: 'When an Asana lead enters No Response, retrieve contact details, check whether the lead already responded, then follow up until response. Stop when they respond and update status. If they do not respond, wait, try again, and escalate only after a configured attempt limit. The interval, attempt limit, channel, owner, and escalation policy are not specified.' },
  { name: 'Approved collection', platform: 'make', scope: 'After a manager approves a collection of entries, iterate every approved entry, add one row per entry to Google Sheets, aggregate the results, and notify Slack when processing is complete. Ask who owns approval if it is not stated.' },
  { name: 'Service routing', platform: 'n8n', scope: 'When a qualified CRM lead selects one of three service types, route to Cleaning, Maintenance, or Repair. Send a different Gmail email variation for each service, merge the routes, and log the result in Google Sheets.' },
  { name: 'Gmail attachment intake', platform: 'make', scope: 'When Gmail receives a message with attachments, iterate through each attachment, upload every file to Google Drive, aggregate the uploaded links, and notify Slack. Preserve the unknown destination folder and notification owner as questions.' },
  { name: 'Shopify fulfillment limitation', platform: 'zapier', scope: 'When a Shopify order is paid, interpret the fulfillment request and notify Slack. Shopify operation support is not verified in the current catalog, so preserve that limitation and do not invent a Shopify operation. A future grounding stage may consider Generic API only as an unresolved alternative.' },
];
const targetedScenarios: typeof coreScenarios = [
  { name: 'Single lead versus attachments', platform: 'n8n', scope: 'For one Asana lead, retrieve all Gmail attachments, iterate each attachment, and upload it to Google Drive.' },
  { name: 'Filter versus visible false path', platform: 'make', scope: 'Check whether the lead responded. If true update Asana; if false send a Gmail reminder.' },
  { name: 'IF versus three service routes', platform: 'n8n', scope: 'Route each request to Cleaning, Maintenance, or Repair based on service type.' },
  { name: 'Merge versus aggregator', platform: 'make', scope: 'Process every attachment and aggregate uploaded links, then merge the approved and rejected business branches before notifying Slack.' },
  { name: 'Business loop versus retry', platform: 'n8n', scope: 'Follow up weekly until the lead responds, but retry a failed Gmail API request at most three times.' },
  { name: 'Status versus approval', platform: 'zapier', scope: 'When the Asana status becomes Approved, send onboarding instructions. No human approval is requested.' },
  { name: 'Explicit delay interval', platform: 'n8n', scope: 'Wait 7 days, then send the next Gmail reminder.' },
  { name: 'Missing delay interval', platform: 'make', scope: 'Wait, then send the next Gmail reminder. Ask for the missing interval.' },
  { name: 'Create or update convergence', platform: 'n8n', scope: 'Search Google Sheets by lead ID. Create the row when absent or update it when present, then merge both paths and notify Slack.' },
  { name: 'Independent Asana workflows', platform: 'n8n', scope: 'Create separate workflow previews: when an Asana lead is Ready create a Google Drive folder; when it is Quoted send weekly Gmail reminders; when it is Paid notify Slack.' },
];

describe.skipIf(process.env.LIVE_P3 !== 'true')('P3 live Qwen Stage A/B benchmark', () => {
  it('runs the core and targeted P3.7 scenarios through bounded shadow stages', async () => {
    const intelligence = new ScopeIntelligenceService();
    const service = new P3ShadowExperimentService({ stageATimeoutMs: 180_000, stageBTimeoutMs: 240_000, totalTimeoutMs: 480_000, maximumRetries: 1, maximumOutputCharacters: 60_000, cacheEnabled: true }, new OllamaPlannerStageRunnerFactory({ baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434', model: 'qwen3:8b' }));
    const results = [];
    const scenarios = process.env.LIVE_P37_TARGETED === 'true' ? [...coreScenarios, ...targetedScenarios] : coreScenarios;
    const selectedScenarios = process.env.P3_SCENARIO ? scenarios.filter((scenario) => scenario.name.toLowerCase().includes(process.env.P3_SCENARIO!.toLowerCase())) : scenarios;
    for (const scenario of selectedScenarios) {
      const analysis = intelligence.analyze(scenario.scope, new Date('2026-07-16T00:00:00.000Z'));
      const result = await service.run(scenario.scope, scenario.platform, analysis, leadQualificationWorkflow);
      results.push({
        name: scenario.name, status: result.status, intent: result.intent, skeleton: result.skeleton,
        intentValidation: result.intentValidation, skeletonValidation: result.skeletonValidation,
        stages: result.report.stages.map((stage) => ({ id: stage.stageInstanceId, status: stage.status, attempts: stage.attempts, cache: stage.cache, latencyMs: stage.latencyMs, failure: stage.failure?.category ?? null, cause: stage.failure?.cause ?? null })),
        metrics: result.metrics, persisted: result.persisted, productionWorkflowUnchanged: result.productionWorkflowUnchanged,
      });
    }
    console.log(`P3_LIVE_RESULTS=${JSON.stringify(results)}`);
    expect(results).toHaveLength(selectedScenarios.length);
    expect(results.every((result) => result.persisted === false && result.productionWorkflowUnchanged)).toBe(true);
  }, 3_600_000);
});
