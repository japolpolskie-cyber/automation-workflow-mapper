import { describe, expect, it } from 'vitest';
import { leadQualificationWorkflow, type StructuredWorkflowPlan } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import type { AnalysisProvider } from '../ai/providers/analysis-provider.js';
import { PlannerShadowService } from './planner-shadow-service.js';

const scenarios = [
  { name: 'Asana CRM', scope: 'When an Asana task moves to Ready, retrieve task details. Find or create a Google Drive folder. Did the lead respond? If no send a Gmail follow-up every 2 days, stop after 3 attempts, and escalate to the owner. Log one row in Google Sheets.', shape: 'binary' },
  { name: 'Shopify fulfillment', scope: 'When Shopify receives an order, process each item, route by service type to Cleaning, Maintenance, Repair, or Installation, merge all routes, and notify Slack.', shape: 'router' },
  { name: 'Gmail attachment intake', scope: 'When Gmail receives a message, for each attachment upload the file to Google Drive, aggregate all results into one summary, and add one row to Google Sheets.', shape: 'iterator' },
] as const;

describe('K4.1 real-world shadow benchmarks', () => {
  it.each(scenarios)('$name produces an explicit grounded execution graph', async ({ scope, shape }) => {
    const analysis = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-16T00:00:00.000Z'));
    const fact = analysis.facts.find((item) => item.kind !== 'uncertainty')!; const evidenceId = fact.evidence[0]!.id;
    const node = (id: string, canonicalFunctionId: string) => ({ id, canonicalFunctionId, title: id, applicationRef: null, operationRef: null, inputs: [], outputs: [], factIds: [fact.id], patternIds: [], knowledgeIds: [], capabilityIds: [], blockedByClarificationIds: [], limitationAcknowledgements: [] });
    const edge = (id: string, source: string, target: string, label: string, condition: string | null = null) => ({ id, source, target, condition, label, purpose: 'Continue the grounded business process.', businessReason: 'The scope requires this transition.', ruleId: 'benchmark.transition', evidenceIds: [evidenceId] });
    let nodes; let edges; let binaryConditions: StructuredWorkflowPlan['binaryConditions'] = []; let routers: StructuredWorkflowPlan['routers'] = []; let merges: StructuredWorkflowPlan['merges'] = [];
    if (shape === 'binary') {
      nodes = [node('trigger', 'trigger'), node('condition', 'binary-condition'), node('yes', 'action'), node('no', 'action')];
      edges = [edge('start', 'trigger', 'condition', 'NEXT'), edge('true', 'condition', 'yes', 'TRUE', 'lead responded'), edge('false', 'condition', 'no', 'FALSE', 'lead did not respond')];
      binaryConditions = [{ nodeId: 'condition', trueEdgeId: 'true', falseEdgeId: 'false' }];
    } else if (shape === 'router') {
      nodes = [node('trigger', 'trigger'), node('router', 'multi-route-decision'), node('merge', 'merge'), node('end', 'end')];
      edges = [edge('start', 'trigger', 'router', 'NEXT'), edge('cleaning', 'router', 'merge', 'CLEANING', 'service = cleaning'), edge('repair', 'router', 'merge', 'REPAIR', 'service = repair'), edge('continue', 'merge', 'end', 'CONTINUE')];
      routers = [{ nodeId: 'router', routes: [{ label: 'CLEANING', condition: 'service = cleaning', destination: 'merge', edgeId: 'cleaning' }, { label: 'REPAIR', condition: 'service = repair', destination: 'merge', edgeId: 'repair' }] }];
      merges = [{ nodeId: 'merge', incomingBranches: ['cleaning', 'repair'], mergeStrategy: 'first_available', continuationEdgeId: 'continue' }];
    } else {
      nodes = [node('trigger', 'trigger'), node('iterator', 'iterator'), node('aggregate', 'aggregator'), node('end', 'end')];
      edges = [edge('start', 'trigger', 'iterator', 'NEXT'), edge('items', 'iterator', 'aggregate', 'EACH ITEM', 'attachment remains'), edge('done', 'aggregate', 'end', 'COMPLETE')];
    }
    const plan = { version: '1.1', objective: scope, platform: 'n8n', entryNodeId: 'trigger', nodes, edges, binaryConditions, routers, merges, loops: [], retries: [], blockedByClarificationIds: analysis.clarifications.map((item) => item.id), warnings: [] };
    const provider: AnalysisProvider = { name: 'ollama', async analyze() { return leadQualificationWorkflow; }, async planGrounded() { return plan; }, async getStatus() { return { provider: 'ollama', available: true, models: ['qwen3:8b'], message: 'ready' }; } };
    const comparison = await new PlannerShadowService().compare(provider, scope, 'n8n', analysis, leadQualificationWorkflow);
    expect(comparison.status).toBe('completed'); expect(comparison.metrics.groundedEdgeCount).toBe(edges.length);
    expect(comparison.differences.unsupportedOperations).toEqual([]); expect(comparison.differences.preservedClarifications).toHaveLength(analysis.clarifications.length);
  });
});
