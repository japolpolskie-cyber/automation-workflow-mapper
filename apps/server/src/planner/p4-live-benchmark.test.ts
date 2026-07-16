import { describe, expect, it } from 'vitest';
import { leadQualificationWorkflow, type Platform } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { OllamaPlannerStageRunnerFactory } from '../distributed-planner/p3-ollama-stage-runner.js';
import { P4DeterministicPlannerService } from './p4-deterministic-planner-service.js';

const scenarios: Array<{ name: string; platform: Platform; scope: string }> = [
  { name: 'Asana CRM five lifecycles', platform: 'n8n', scope: 'Build five Asana CRM lifecycle automations: when a lead becomes Ready create its Google Drive folder and Asana subtasks; when No Response follow up until response; when Quoted send weekly quote reminders; when Approved send onboarding instructions; when Paid and Closed send a service recommendation. Log lifecycle activity in Google Sheets. Preserve missing follow-up interval, attempt limit, owner, and escalation policy as questions.' },
  { name: 'No Response follow-up', platform: 'n8n', scope: 'When an Asana lead enters No Response, retrieve contact details, check whether the lead already responded, then follow up until response. Stop when they respond and update status. If they do not respond, wait, try again, and escalate only after a configured attempt limit. The interval, attempt limit, channel, owner, and escalation policy are not specified.' },
  { name: 'Approved collection', platform: 'make', scope: 'After a manager approves a collection of entries, iterate every approved entry, add one row per entry to Google Sheets, aggregate the results, and notify Slack when processing is complete. Ask who owns approval if it is not stated.' },
  { name: 'Service routing', platform: 'n8n', scope: 'When a qualified CRM lead selects one of three service types, route to Cleaning, Maintenance, or Repair. Send a different Gmail email variation for each service, merge the routes, and log the result in Google Sheets.' },
  { name: 'Gmail attachment intake', platform: 'make', scope: 'When Gmail receives a message with attachments, iterate through each attachment, upload every file to Google Drive, aggregate the uploaded links, and notify Slack. Preserve the unknown destination folder and notification owner as questions.' },
  { name: 'Shopify fulfillment limitation', platform: 'zapier', scope: 'When a Shopify order is paid, interpret the fulfillment request and notify Slack. Shopify operation support is not verified in the current catalog, so preserve that limitation and do not invent a Shopify operation. A future grounding stage may consider Generic API only as an unresolved alternative.' },
];

describe.skipIf(process.env.LIVE_P4 !== 'true')('P4 live business-intent and deterministic compiler benchmark', () => {
  it('runs six Stage A scenarios and compiles topology without an AI Stage B', async () => {
    const intelligence = new ScopeIntelligenceService();
    const service = new P4DeterministicPlannerService(new OllamaPlannerStageRunnerFactory({
      baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
      model: 'qwen3:8b',
    }));
    const results = [];
    const selected = process.env.P4_SCENARIO ? scenarios.filter((scenario) => scenario.name.toLowerCase().includes(process.env.P4_SCENARIO!.toLowerCase())) : scenarios;
    for (const scenario of selected) {
      const analysis = intelligence.analyze(scenario.scope, new Date('2026-07-16T00:00:00.000Z'));
      const result = await service.run(scenario.scope, scenario.platform, analysis, leadQualificationWorkflow);
      results.push({
        name: scenario.name, status: result.status, stageASuccess: result.intent !== null && result.intentValidation.length === 0,
        compilerSuccess: result.plan !== null && result.compilerIssues.length === 0,
        nodeCount: result.plan?.nodes.length ?? 0, edgeCount: result.plan?.edges.length ?? 0,
        topology: {
          binary: result.plan?.binaryConditions.length ?? 0, routers: result.plan?.routers.length ?? 0,
          loops: result.plan?.loops.length ?? 0, merges: result.plan?.merges.length ?? 0,
          retries: result.plan?.retries.length ?? 0,
        },
        promptCharacters: result.metrics.stageA.reduce((sum, item) => sum + item.promptCharacters, 0),
        stageALatencyMs: result.metrics.stageA.reduce((sum, item) => sum + item.latencyMs, 0),
        compilerLatencyMs: result.metrics.compilerLatencyMs, totalLatencyMs: result.metrics.totalLatencyMs,
        retryCount: result.metrics.retryCount, clarificationCount: result.plan?.blockedByClarificationIds.length ?? 0,
        persisted: result.persisted, productionWorkflowUnchanged: result.productionWorkflowUnchanged,
      });
    }
    const summary = {
      scenarios: results.length,
      stageASuccess: results.filter((item) => item.stageASuccess).length,
      compilerSuccess: results.filter((item) => item.compilerSuccess).length,
      topologyValidationRate: results.filter((item) => item.compilerSuccess).length / results.length,
      totalLatencyMs: Number(results.reduce((sum, item) => sum + item.totalLatencyMs, 0).toFixed(2)),
      averagePromptCharacters: Math.round(results.reduce((sum, item) => sum + item.promptCharacters, 0) / results.length),
      retryCount: results.reduce((sum, item) => sum + item.retryCount, 0),
      results,
    };
    console.log(`P4_LIVE_SUMMARY=${JSON.stringify(summary)}`);
    expect(results).toHaveLength(selected.length);
    expect(results.every((item) => item.persisted === false && item.productionWorkflowUnchanged)).toBe(true);
  }, 1_800_000);
});
