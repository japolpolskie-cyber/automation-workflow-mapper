import { describe, expect, it } from 'vitest';
import { leadQualificationWorkflow, type Platform } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { OllamaAnalysisProvider } from '../ai/providers/ollama-provider.js';
import { PlannerShadowService } from './planner-shadow-service.js';

export const k42LiveScenarios: ReadonlyArray<{ name: string; platform: Platform; scope: string }> = [
  { name: 'Asana CRM', platform: 'n8n', scope: 'When an Asana task moves to Ready, retrieve task details, search for and create a Google Drive client folder if missing, create or update Asana subtasks, send a Gmail follow-up, log the result in Google Sheets, ask whether the lead responded with explicit yes and no paths, and route by service type. Do not assume a follow-up interval, attempt limit, or escalation policy.' },
  { name: 'Gmail attachment intake', platform: 'make', scope: 'When Gmail receives a message with attachments, iterate through each attachment, upload every file to Google Drive, aggregate the uploaded links, and notify Slack. Ask who should be notified if the owner is missing.' },
  { name: 'Shopify fulfillment limitation', platform: 'zapier', scope: 'When a Shopify order is paid, retrieve its line items, create a fulfillment request through a verified connector if supported, and notify Slack. If Shopify fulfillment is unsupported in the catalog, preserve the limitation and propose Generic API without inventing an operation.' },
  { name: 'Follow up until response', platform: 'n8n', scope: 'After sending a Gmail quote, wait and follow up until the client responds. If they respond, notify sales in Slack; otherwise escalate after a stated maximum of three attempts. Ask for the missing wait interval.' },
  { name: 'Approved collection iterator', platform: 'make', scope: 'After the HR manager approves all onboarding records in Google Sheets, iterate through each approved employee, create their Google Drive folder, send a Gmail welcome message, aggregate results, and notify Slack of failures.' },
  { name: 'Service multi-route', platform: 'n8n', scope: 'When a Generic CRM lead is qualified, route by service type: consulting creates an Asana task, implementation creates a Google Drive folder, and support sends a Slack notification. Merge all completed routes and log the outcome in Google Sheets.' },
];

describe.skipIf(process.env.LIVE_K4_2 !== 'true')('K4.2 live Qwen 3 8B benchmark', () => {
  it('runs the six required bounded scenarios without persisting shadow output', async () => {
    const provider = new OllamaAnalysisProvider({ baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434', models: ['qwen3:8b'] });
    const planner = new PlannerShadowService(undefined, undefined, { timeoutMs: 30_000, maximumOutputCharacters: 120_000, maximumRetries: 1, contextBudget: 24_000 });
    const intelligence = new ScopeIntelligenceService();
    const results = [];
    for (const scenario of k42LiveScenarios) {
      const analysis = intelligence.analyze(scenario.scope, new Date('2026-07-16T00:00:00.000Z'));
      const result = await planner.compare(provider, scenario.scope, scenario.platform, analysis, leadQualificationWorkflow);
      results.push({ name: scenario.name, status: result.status, metrics: result.metrics, diagnostic: result.diagnostic, error: result.error });
    }
    console.log(`K4_2_LIVE_RESULTS=${JSON.stringify(results)}`);
    expect(results).toHaveLength(6);
  }, 300_000);
});
