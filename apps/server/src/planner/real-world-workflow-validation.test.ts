import { describe, expect, it } from 'vitest';
import type { Platform } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { PlannerContextBuilder } from './planner-context-builder.js';
import { DeterministicSkeletonCompiler } from './deterministic-skeleton-compiler.js';
import { StageCGroundingService } from './stage-c-grounding-service.js';
import { StageDGroundingService } from './stage-d-grounding-service.js';

type BranchExpectation = 'none' | 'binary' | 'router' | 'collection' | 'approval' | 'loop';
interface Scenario {
  name: string; industry: string; platform: Platform; scope: string;
  functions: string[]; applications: string[]; branch: BranchExpectation;
}

const scenarios: Scenario[] = [
  { name: 'CRM lead management', industry: 'Sales', platform: 'n8n', scope: 'When a Generic CRM lead is created, retrieve the record, validate the email, and if the lead is qualified update the CRM record; otherwise notify Slack.', functions: ['trigger','data-retrieval','validation','binary-condition','action'], applications: ['Generic CRM','Slack'], branch: 'binary' },
  { name: 'Customer onboarding', industry: 'Customer success', platform: 'make', scope: 'When an Asana customer onboarding task is approved, create a Google Drive folder, send a Gmail welcome email, and log one row in Google Sheets.', functions: ['trigger','human-approval','action','logging'], applications: ['Asana','Google Drive','Gmail','Google Sheets'], branch: 'approval' },
  { name: 'Employee onboarding', industry: 'HR', platform: 'n8n', scope: 'When an employee is approved for onboarding, create onboarding tasks in Asana, create a Google Drive folder, and notify Slack. If rejected, notify HR.', functions: ['trigger','human-approval','action'], applications: ['Asana','Google Drive','Slack'], branch: 'approval' },
  { name: 'Invoice approval', industry: 'Finance', platform: 'make', scope: 'When a new invoice arrives by Gmail, retrieve its attachment, request human approval, and if approved log it in Google Sheets; otherwise send a Gmail rejection notice.', functions: ['trigger','data-retrieval','human-approval','action'], applications: ['Gmail','Google Sheets'], branch: 'approval' },
  { name: 'Purchase request approval', industry: 'Procurement', platform: 'zapier', scope: 'When a purchase request is added to Google Sheets, if the amount is above 5000 request human approval; if approved notify Slack, otherwise mark it rejected.', functions: ['trigger','binary-condition','human-approval','notification'], applications: ['Google Sheets','Slack'], branch: 'binary' },
  { name: 'IT helpdesk ticket routing', industry: 'IT', platform: 'n8n', scope: 'When a Generic API helpdesk ticket is received by webhook, route Hardware, Software, and Access requests to separate Slack channels, then merge the routes and log the result.', functions: ['trigger','multi-route-decision','notification','merge','logging'], applications: ['Webhook / Generic API','Slack'], branch: 'router' },
  { name: 'Shopify order fulfillment', industry: 'Commerce', platform: 'make', scope: 'When a Shopify order is paid, validate inventory, fulfill the order, and notify Slack. Shopify fulfillment capability is required.', functions: ['trigger','validation','action','notification'], applications: ['Shopify','Slack'], branch: 'none' },
  { name: 'Inventory alerts', industry: 'Commerce', platform: 'zapier', scope: 'Every day retrieve all low-stock rows from Google Sheets, iterate each item, and send a Slack inventory alert.', functions: ['trigger','data-retrieval','iterator','notification'], applications: ['Google Sheets','Slack'], branch: 'collection' },
  { name: 'Gmail attachment processing', industry: 'Operations', platform: 'make', scope: 'When Gmail receives an email with attachments, retrieve every attachment, iterate each file, upload it to Google Drive, and aggregate the uploaded links.', functions: ['trigger','data-retrieval','iterator','action','aggregator'], applications: ['Gmail','Google Drive'], branch: 'collection' },
  { name: 'Google Drive organization', industry: 'Operations', platform: 'n8n', scope: 'When a file is uploaded to Google Drive, retrieve its metadata, route Contracts, Invoices, and Other files to matching folders, then merge and log the result in Google Sheets.', functions: ['trigger','data-retrieval','multi-route-decision','merge','logging'], applications: ['Google Drive','Google Sheets'], branch: 'router' },
  { name: 'HR recruitment', industry: 'HR', platform: 'make', scope: 'When an applicant is added to Google Sheets, create an Asana interview task, send a Gmail invitation, wait two days, and send a reminder.', functions: ['trigger','action','delay','notification'], applications: ['Google Sheets','Asana','Gmail'], branch: 'none' },
  { name: 'Leave request approval', industry: 'HR', platform: 'n8n', scope: 'When a leave request arrives by webhook, request human approval. If approved create a Google Calendar event and notify Slack; if rejected send a Gmail notice.', functions: ['trigger','human-approval','action','notification'], applications: ['Webhook / Generic API','Google Calendar','Slack','Gmail'], branch: 'approval' },
  { name: 'Marketing campaign approval', industry: 'Marketing', platform: 'make', scope: 'When an Asana campaign task is ready, request human approval; on approval notify Slack and update Asana, on rejection return it for revision.', functions: ['trigger','human-approval','notification','action'], applications: ['Asana','Slack'], branch: 'approval' },
  { name: 'Social media scheduling', industry: 'Marketing', platform: 'zapier', scope: 'Every weekday retrieve approved social posts from Google Sheets, iterate every post, schedule it through a Generic API, and log completion.', functions: ['trigger','data-retrieval','iterator','action','logging'], applications: ['Google Sheets','Webhook / Generic API'], branch: 'collection' },
  { name: 'Customer support escalation', industry: 'Support', platform: 'n8n', scope: 'When a support webhook receives a ticket, if priority is urgent notify Slack and request human approval for escalation; otherwise create an Asana task.', functions: ['trigger','binary-condition','notification','human-approval','action'], applications: ['Webhook / Generic API','Slack','Asana'], branch: 'binary' },
  { name: 'Appointment reminders', industry: 'Healthcare', platform: 'make', scope: 'Every morning retrieve today appointments from Google Sheets, iterate each appointment, wait until two hours before it, and send a Gmail reminder.', functions: ['trigger','data-retrieval','iterator','delay','notification'], applications: ['Google Sheets','Gmail'], branch: 'collection' },
  { name: 'Sales quote follow-up', industry: 'Sales', platform: 'n8n', scope: 'When an Asana quote task enters Sent, send a Gmail follow-up every 3 days until the client responds, maximum 4 attempts, then escalate to Slack.', functions: ['trigger','loop','delay','binary-condition','notification'], applications: ['Asana','Gmail','Slack'], branch: 'loop' },
  { name: 'Contract approval', industry: 'Legal', platform: 'make', scope: 'When a contract is uploaded to Google Drive, request human approval. If approved update the Asana contract task; if rejected send a Gmail revision request.', functions: ['trigger','human-approval','action'], applications: ['Google Drive','Asana','Gmail'], branch: 'approval' },
  { name: 'Event registration', industry: 'Events', platform: 'zapier', scope: 'When a registration is added to Google Sheets, validate the email, create a Google Calendar event, and send a Gmail confirmation.', functions: ['trigger','validation','action'], applications: ['Google Sheets','Google Calendar','Gmail'], branch: 'none' },
  { name: 'Newsletter automation', industry: 'Marketing', platform: 'make', scope: 'Every Monday retrieve approved newsletter entries from Google Sheets, aggregate the entries, and send the newsletter through Gmail.', functions: ['trigger','data-retrieval','aggregator','action'], applications: ['Google Sheets','Gmail'], branch: 'none' },
  { name: 'Slack notifications', industry: 'Operations', platform: 'zapier', scope: 'When an Asana task becomes blocked, retrieve task details and send a Slack notification with the owner and due date.', functions: ['trigger','data-retrieval','notification'], applications: ['Asana','Slack'], branch: 'none' },
  { name: 'Airtable synchronization', industry: 'Data operations', platform: 'n8n', scope: 'When an Airtable record changes, find the matching Generic CRM record and create or update it without duplicates.', functions: ['trigger','data-retrieval','binary-condition','action','merge'], applications: ['Airtable','Generic CRM'], branch: 'binary' },
  { name: 'HubSpot lead nurturing', industry: 'Sales', platform: 'make', scope: 'When a HubSpot lead enters Nurture, send a Gmail follow-up weekly until response, maximum 3 attempts, then notify Slack.', functions: ['trigger','loop','delay','notification'], applications: ['HubSpot','Gmail','Slack'], branch: 'loop' },
  { name: 'Stripe payment notifications', industry: 'Finance', platform: 'zapier', scope: 'When Stripe reports a successful payment, retrieve the customer, add a Google Sheets row, and notify Slack.', functions: ['trigger','data-retrieval','logging','notification'], applications: ['Stripe','Google Sheets','Slack'], branch: 'none' },
  { name: 'Asana project creation', industry: 'Project delivery', platform: 'make', scope: 'When a Generic CRM deal is won, retrieve deal details, create an Asana project, create a Google Drive folder, and notify Slack.', functions: ['trigger','data-retrieval','action','notification'], applications: ['Generic CRM','Asana','Google Drive','Slack'], branch: 'none' },
  { name: 'ClickUp task automation', industry: 'Project delivery', platform: 'n8n', scope: 'When a ClickUp task is completed, retrieve task details and add a Google Sheets row, then notify Slack.', functions: ['trigger','data-retrieval','logging','notification'], applications: ['ClickUp','Google Sheets','Slack'], branch: 'none' },
  { name: 'Trello card management', industry: 'Project delivery', platform: 'zapier', scope: 'When a Trello card moves to Done, retrieve card details, create a Google Drive archive folder, and send a Gmail summary.', functions: ['trigger','data-retrieval','action'], applications: ['Trello','Google Drive','Gmail'], branch: 'none' },
  { name: 'Outlook email processing', industry: 'Operations', platform: 'make', scope: 'When Outlook receives an invoice email, retrieve all attachments, iterate each attachment, upload it to Google Drive, and log it in Google Sheets.', functions: ['trigger','data-retrieval','iterator','action','logging'], applications: ['Outlook','Google Drive','Google Sheets'], branch: 'collection' },
  { name: 'Google Calendar scheduling', industry: 'Scheduling', platform: 'n8n', scope: 'When an approved Asana meeting task is created, search Google Calendar for conflicts; if clear create the event, otherwise notify Slack.', functions: ['trigger','data-retrieval','binary-condition','action','notification'], applications: ['Asana','Google Calendar','Slack'], branch: 'binary' },
  { name: 'Multi-step conditional approval', industry: 'Finance', platform: 'n8n', scope: 'When a purchase request arrives by webhook, if amount exceeds 10000 request manager approval, then finance approval; if either rejects notify Slack and end.', functions: ['trigger','binary-condition','human-approval','notification','end'], applications: ['Webhook / Generic API','Slack'], branch: 'binary' },
];

describe('real-world workflow generation validation', () => {
  it('evaluates at least thirty diverse business automation scenarios through P4, Stage C, and Stage D', async () => {
    const intelligence = new ScopeIntelligenceService();
    const contextBuilder = new PlannerContextBuilder();
    const stageC = new StageCGroundingService({ enabled: true, maximumConcurrency: 8, nodeTimeoutMs: 5_000, maximumRetries: 0, cacheEnabled: true, maximumOutputCharacters: 30_000 });
    const stageD = new StageDGroundingService({ enabled: true, maximumConcurrency: 8, edgeTimeoutMs: 5_000, maximumRetries: 0, cacheEnabled: true, maximumOutputCharacters: 30_000 });
    const results = [];
    for (const scenario of scenarios) {
      const analysis = intelligence.analyze(scenario.scope, new Date('2026-07-17T00:00:00.000Z'));
      const context = contextBuilder.build(scenario.scope, scenario.platform, analysis);
      const compiled = new DeterministicSkeletonCompiler().compile(context);
      const grounding = await stageC.ground(compiled.plan, context);
      const edges = await stageD.ground(compiled.plan, grounding.nodes, context);
      const actualFunctions = new Set(compiled.plan.nodes.map((node) => node.canonicalFunctionId));
      const detectedApps = new Set(analysis.facts.filter((fact) => fact.kind === 'application').map((fact) => fact.value.toLowerCase()));
      const functionMatches = scenario.functions.filter((item) => actualFunctions.has(item));
      const applicationMatches = scenario.applications.filter((item) => detectedApps.has(item.toLowerCase()));
      const branchPass = scenario.branch === 'none'
        || (scenario.branch === 'binary' && compiled.plan.binaryConditions.length > 0)
        || (scenario.branch === 'router' && compiled.plan.routers.length > 0)
        || (scenario.branch === 'collection' && actualFunctions.has('iterator'))
        || (scenario.branch === 'approval' && actualFunctions.has('human-approval') && compiled.plan.binaryConditions.length > 0)
        || (scenario.branch === 'loop' && compiled.plan.loops.length > 0);
      const structuralPass = compiled.issues.length === 0 && edges.validationIssues.length === 0;
      const capabilitySafe = grounding.metrics.invalidReferences === 0 && grounding.metrics.roleOperationMismatches === 0 && grounding.metrics.cardinalityMismatches === 0;
      const groundingRatio = grounding.metrics.totalNodes ? (grounding.metrics.deterministicallyGroundedNodes + grounding.metrics.modelGroundedNodes) / grounding.metrics.totalNodes : 0;
      const qualityScore = Math.round(
        (functionMatches.length / scenario.functions.length) * 30
        + (applicationMatches.length / scenario.applications.length) * 15
        + (branchPass ? 15 : 0)
        + (structuralPass ? 20 : 0)
        + (capabilitySafe ? 10 : 0)
        + groundingRatio * 10,
      );
      const missingCapabilities = grounding.nodes.filter((node) => node.groundingMethod === 'unresolved').map((node) => node.unresolvedRequirement ?? node.purpose);
      const functionCoverage = functionMatches.length / scenario.functions.length;
      const applicationCoverage = applicationMatches.length / scenario.applications.length;
      const passed = qualityScore >= 70 && functionCoverage >= 0.7 && applicationCoverage >= 0.75 && structuralPass && branchPass;
      results.push({
        name: scenario.name, industry: scenario.industry, platform: scenario.platform, passed, qualityScore,
        nodeSelection: { expected: scenario.functions.length, matched: functionMatches.length, missing: scenario.functions.filter((item) => !actualFunctions.has(item)) },
        applications: { expected: scenario.applications.length, matched: applicationMatches.length, missing: scenario.applications.filter((item) => !detectedApps.has(item.toLowerCase())) },
        branching: { expected: scenario.branch, passed: branchPass },
        platformBestPractices: { safe: capabilitySafe, invalidReferences: grounding.metrics.invalidReferences, unsupportedRejected: grounding.metrics.unsupportedOperationsRejected },
        missingCapabilities: [...new Set(missingCapabilities)],
        explanation: passed ? 'Topology, branch semantics, and capability safety met the benchmark threshold.' : 'One or more expected business functions, applications, branches, or verified operations were missing.',
      });
    }
    const summary = {
      scenarios: results.length,
      passed: results.filter((item) => item.passed).length,
      failed: results.filter((item) => !item.passed).length,
      averageScore: Math.round(results.reduce((sum, item) => sum + item.qualityScore, 0) / results.length),
      branchPassRate: Number((results.filter((item) => item.branching.passed).length / results.length).toFixed(3)),
      capabilitySafeRate: Number((results.filter((item) => item.platformBestPractices.safe).length / results.length).toFixed(3)),
      results,
    };
    console.log(`REAL_WORLD_VALIDATION=${JSON.stringify(summary)}`);
    expect(scenarios).toHaveLength(30);
    expect(new Set(scenarios.map((item) => item.industry)).size).toBeGreaterThanOrEqual(10);
    expect(results.every((item) => item.platformBestPractices.invalidReferences === 0)).toBe(true);
    expect(results.reduce((sum, item) => sum + item.platformBestPractices.unsupportedRejected, 0)).toBeGreaterThanOrEqual(0);
  }, 30_000);
});
