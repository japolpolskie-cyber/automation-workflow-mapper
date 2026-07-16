import { describe, expect, it } from 'vitest';
import { structuredWorkflowPlanSchema, type PlannerContext, type Platform, type StageCGroundingReport, type StructuredWorkflowPlan } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { PlannerContextBuilder } from './planner-context-builder.js';
import { StageCGroundingService } from './stage-c-grounding-service.js';

interface Scenario { name: string; platform: Platform; scope: string; nodes: Array<[string, string]> }
const scenarios: Scenario[] = [
  {
    name: 'Asana Ready to Start', platform: 'n8n',
    scope: 'When an Asana task moves to Ready to Start, retrieve task details, search for and create a Google Drive folder, then search, create, or update an Asana subtask.',
    nodes: [['trigger', 'Asana task moved to Ready to Start'], ['data-retrieval', 'Retrieve Asana task details'], ['data-retrieval', 'Search Google Drive folder'], ['action', 'Create Google Drive folder'], ['data-retrieval', 'Search Asana subtask'], ['action', 'Create Asana subtask'], ['action', 'Update Asana subtask'], ['end', 'Workflow complete']],
  },
  {
    name: 'No Response', platform: 'n8n',
    scope: 'Retrieve the CRM lead, send a Gmail follow-up, update Asana status, and send SMS although no SMS provider is specified.',
    nodes: [['trigger', 'Asana No Response status'], ['data-retrieval', 'Retrieve CRM lead'], ['action', 'Send Gmail follow-up email'], ['action', 'Update Asana task status'], ['action', 'Send SMS follow-up'], ['end', 'Workflow complete']],
  },
  {
    name: 'Approved collection', platform: 'make',
    scope: 'For every approved entry, iterate the collection and add the current item as one Google Sheets row.',
    nodes: [['trigger', 'Approved collection received'], ['iterator', 'Iterator current item'], ['action', 'Add current entry to Google Sheets row'], ['aggregator', 'Aggregate item results'], ['end', 'Workflow complete']],
  },
  {
    name: 'Service recommendation', platform: 'n8n',
    scope: 'Route Cleaning, Maintenance, and Repair service recommendations and send a Gmail email variation for each route.',
    nodes: [['trigger', 'Qualified lead received'], ['multi-route-decision', 'Route by service type'], ['action', 'Send Gmail Cleaning email'], ['action', 'Send Gmail Maintenance email'], ['action', 'Send Gmail Repair email'], ['merge', 'Merge service routes'], ['end', 'Workflow complete']],
  },
  {
    name: 'Gmail attachment intake', platform: 'make',
    scope: 'When Gmail receives a new email, retrieve email attachments, iterate each file, and upload the attachment to Google Drive.',
    nodes: [['trigger', 'Gmail new email'], ['data-retrieval', 'Retrieve Gmail email attachments'], ['iterator', 'Iterator current attachment'], ['action', 'Upload attachment file to Google Drive'], ['aggregator', 'Aggregate uploaded files'], ['end', 'Workflow complete']],
  },
  {
    name: 'Shopify fulfillment', platform: 'zapier',
    scope: 'When a Shopify order is paid, fulfill the Shopify order. The current catalog has no Shopify fulfillment pack.',
    nodes: [['trigger', 'Shopify paid order'], ['action', 'Fulfill Shopify order'], ['end', 'Workflow complete']],
  },
];

const buildPlan = (context: PlannerContext, specs: Array<[string, string]>): StructuredWorkflowPlan => {
  const evidence = context.evidence[0]?.id ?? 'benchmark-evidence';
  if (!context.evidence.length) context.evidence.push({ id: evidence, evidenceType: 'explicit', ruleId: 'benchmark', ruleVersion: '1.0.0', text: context.objective, explanation: 'Benchmark scope.', sourceStart: 0, sourceEnd: context.objective.length });
  const fact = context.facts[0]?.id ?? 'benchmark-fact';
  if (!context.facts.length) context.facts.push({ id: fact, kind: 'business_verb', value: 'process', explanation: 'Benchmark request.', entityId: null, evidenceIds: [evidence] });
  const nodes = specs.map(([canonicalFunctionId, title], index) => ({
    id: `benchmark-node-${index + 1}`, canonicalFunctionId, title, applicationRef: null, operationRef: null,
    inputs: index ? ['previous-step-data'] : [], outputs: canonicalFunctionId === 'end' ? [] : ['step-result'],
    factIds: context.facts.map((item) => item.id), patternIds: [], knowledgeIds: [], capabilityIds: [],
    blockedByClarificationIds: [], limitationAcknowledgements: [],
  }));
  const edges = nodes.slice(1).map((target, index) => ({
    id: `benchmark-edge-${index + 1}`, source: nodes[index]!.id, target: target.id, condition: null,
    label: 'NEXT', purpose: 'Benchmark sequence.', businessReason: 'Scope sequence.', ruleId: 'benchmark.sequence',
    evidenceIds: [evidence],
  }));
  return structuredWorkflowPlanSchema.parse({
    version: '1.1', objective: context.objective, platform: context.platform, entryNodeId: nodes[0]!.id,
    nodes, edges, binaryConditions: [], routers: [], merges: [], loops: [], retries: [],
    blockedByClarificationIds: [], warnings: [],
  });
};

describe('Stage C six-scenario grounding benchmark', () => {
  it('grounds or explicitly leaves unresolved every node without topology mutation', async () => {
    const intelligence = new ScopeIntelligenceService();
    const contextBuilder = new PlannerContextBuilder();
    const service = new StageCGroundingService({ enabled: true, maximumConcurrency: 4, nodeTimeoutMs: 5_000, maximumRetries: 1, cacheEnabled: true, maximumOutputCharacters: 30_000 });
    const results: Array<{ name: string; report: StageCGroundingReport }> = [];
    for (const scenario of scenarios) {
      const context = contextBuilder.build(scenario.scope, scenario.platform, intelligence.analyze(scenario.scope, new Date('2026-07-16T00:00:00.000Z')));
      const plan = buildPlan(context, scenario.nodes);
      const report = await service.ground(plan, context);
      results.push({ name: scenario.name, report });
    }
    const reports = results.map((item) => item.report);
    const totals = {
      nodes: reports.reduce((sum, report) => sum + report.metrics.totalNodes, 0),
      deterministic: reports.reduce((sum, report) => sum + report.metrics.deterministicallyGroundedNodes, 0),
      model: reports.reduce((sum, report) => sum + report.metrics.modelGroundedNodes, 0),
      unresolved: reports.reduce((sum, report) => sum + report.metrics.unresolvedNodes, 0),
      invalidReferences: reports.reduce((sum, report) => sum + report.metrics.invalidReferences, 0),
      unsupportedRejected: reports.reduce((sum, report) => sum + report.metrics.unsupportedOperationsRejected, 0),
      roleMismatches: reports.reduce((sum, report) => sum + report.metrics.roleOperationMismatches, 0),
      cardinalityMismatches: reports.reduce((sum, report) => sum + report.metrics.cardinalityMismatches, 0),
      topologyMutations: reports.reduce((sum, report) => sum + report.metrics.topologyMutations, 0),
      retries: reports.reduce((sum, report) => sum + report.metrics.retries, 0),
      deterministicLatencyMs: reports.reduce((sum, report) => sum + report.metrics.averageDeterministicLatencyMs, 0) / reports.length,
    };
    console.log(`STAGE_C_BENCHMARK=${JSON.stringify({ totals, scenarios: results.map(({ name, report }) => ({ name, status: report.status, deterministic: report.metrics.deterministicallyGroundedNodes, unresolved: report.metrics.unresolvedNodes })) })}`);
    expect(totals.deterministic + totals.model + totals.unresolved).toBe(totals.nodes);
    expect(totals.invalidReferences).toBe(0);
    expect(totals.roleMismatches).toBe(0);
    expect(totals.cardinalityMismatches).toBe(0);
    expect(totals.topologyMutations).toBe(0);
    expect(reports.every((report) => report.persisted === false && report.topologyUnchanged)).toBe(true);
    const operationFor = (scenario: string, purpose: string) => {
      const node = results.find((item) => item.name === scenario)!.report.nodes.find((item) => item.purpose === purpose)!;
      return `${node.applicationId}.${node.operationId}`;
    };
    expect(operationFor('Asana Ready to Start', 'Asana task moved to Ready to Start')).toBe('asana.task-moved-to-section');
    expect(operationFor('Asana Ready to Start', 'Retrieve Asana task details')).toBe('asana.get-task-details');
    expect(operationFor('Asana Ready to Start', 'Search Google Drive folder')).toBe('google-drive.find-folder');
    expect(operationFor('Asana Ready to Start', 'Create Google Drive folder')).toBe('google-drive.create-folder');
    expect(operationFor('Asana Ready to Start', 'Search Asana subtask')).toBe('asana.find-subtask');
    expect(operationFor('Asana Ready to Start', 'Create Asana subtask')).toBe('asana.create-subtask');
    expect(operationFor('No Response', 'Retrieve CRM lead')).toBe('generic-crm.find-record');
    expect(operationFor('No Response', 'Send Gmail follow-up email')).toBe('gmail.send-email');
    expect(operationFor('No Response', 'Update Asana task status')).toBe('asana.update-task');
    expect(operationFor('Approved collection', 'Add current entry to Google Sheets row')).toBe('google-sheets.add-row');
    expect(operationFor('Gmail attachment intake', 'Gmail new email')).toBe('gmail.new-email');
    expect(operationFor('Gmail attachment intake', 'Retrieve Gmail email attachments')).toBe('gmail.search-email');
    expect(operationFor('Gmail attachment intake', 'Upload attachment file to Google Drive')).toBe('google-drive.upload-file');
    const sms = results.find((item) => item.name === 'No Response')!.report.nodes.find((node) => node.purpose.includes('SMS'))!;
    expect(sms.groundingMethod).toBe('unresolved');
    expect(sms.unresolvedRequirement).toContain('explicitly names sms');
    const shopify = results.find((item) => item.name === 'Shopify fulfillment')!.report.nodes.find((node) => node.purpose.includes('Fulfill'))!;
    expect(shopify.groundingMethod).toBe('unresolved');
    expect(shopify.operationId).toBeNull();
  });
});
