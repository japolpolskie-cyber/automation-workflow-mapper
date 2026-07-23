import { describe, expect, it } from 'vitest';
import { compileAutomationArchitecture, createWorkflowSetFromGraph, validateWorkflowGraph, type CanonicalWorkflow } from '@awm/shared';
import {
  countIndependentWorkflowTriggers,
  isLargeWorkflowPortfolio,
  LocalAnalysisProvider,
  requestsSingleWorkflow,
  shouldPartitionWorkflowScope,
} from './local-provider.js';

const scope = `Make Expert for Asana CRM Automation
We are seeking a skilled Make.com expert to help us streamline our CRM processes in Asana.
Scope of Work
Folder Creation and Subtask Automation
Trigger: When a lead reaches the "Ready to Start" column in Asana.
Action:
Automatically create a folder in Google Drive named after the lead.
Create a subtask titled "Social Media Content" within the lead's task.
Welcome Email Automation
Trigger: When a lead reaches the "Approved" column.
Action: Automatically send a welcome email to the client, including an attached PDF.`;

const detailedScope = `When a new lead enters the CRM, validate the email address.

If valid, assign the lead to a salesperson and send a welcome email.

If invalid, notify the sales manager and move the lead to manual review.

After three days, check whether the lead replied.

If there is no reply, send a follow-up message.`;

const explicitSequenceScope = `You are an automation workflow architect.

Workflow Name
Lead Qualification and Outreach Automation

Target Platform
n8n

Trigger
Webhook — Incoming webhook request

Workflow Sequence
1. Webhook: Receive data
2. External API: Get company info
3. Function: Score and prioritize lead
4. Database: Store lead in SQL
5. Email: Send notification
6. LLM: Generate outreach email

Required Integrations
- Webhook
- External API
- Function
- Database
- Email
- LLM

Workflow Mapping Rules
- Create one explicit node for every business step.
- Add an explicit connection between every related node.
- Use an IF node for binary decisions.`;

const semanticSupportScope = `Create an n8n workflow for handling customer support requests.
The workflow should start when a customer submits a support form through a webhook.
Use an AI Agent to analyze the message, identify the department, determine urgency, and create a short summary.
The AI Agent should use:
- OpenAI Chat Model
- Simple Memory
- HTTP Request Tool
- Vector Store Tool
After the AI Agent, use a Router with three routes:
1. Sales
2. Technical Support
3. Billing
Each route should create a department-specific ticket.
Continue to an IF condition that checks whether the request is high priority:
If the request is high priority:
- Send an urgent Slack notification
If the request is not high priority:
- Log the request in Google Sheets
Finish successfully.
Do not count the AI Agent's Chat Model, Memory, and Tools as normal execution nodes.`;

describe('LocalAnalysisProvider operational fallback', () => {
  it('builds the customer-support fallback from owned semantic artifacts', async () => {
    const workflow = await new LocalAnalysisProvider().analyze({
      scope: semanticSupportScope,
      projectName: 'Customer Support',
      platform: 'n8n',
    }) as CanonicalWorkflow;

    expect(workflow.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'trigger', service: 'Webhook', name: expect.stringMatching(/Webhook/) }),
      expect.objectContaining({ category: 'ai', name: expect.stringMatching(/AI Agent/) }),
      expect.objectContaining({ category: 'router', name: 'Route by department' }),
      expect.objectContaining({ name: 'Create Sales department ticket' }),
      expect.objectContaining({ name: 'Create Technical Support department ticket' }),
      expect.objectContaining({ name: 'Create Billing department ticket' }),
      expect.objectContaining({ category: 'condition', name: 'Is the request high priority?' }),
      expect.objectContaining({ name: 'Send urgent Slack notification', service: 'Slack' }),
      expect.objectContaining({ name: 'Log request in Google Sheets', service: 'Google Sheets' }),
      expect.objectContaining({ category: 'end' }),
    ]));
    expect(workflow.nodes.map((node) => node.name)).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/Wait the AI Agent/i),
      expect.stringMatching(/Wait the department ticket/i),
    ]));
    expect(workflow.connections.filter((edge) => edge.sourceNodeId === workflow.nodes.find((node) => node.category === 'router')?.id).map((edge) => edge.label)).toEqual(['Sales', 'Technical Support', 'Billing']);
    expect(workflow.connections.filter((edge) => edge.branchLabel).map((edge) => edge.branchLabel)).toEqual(expect.arrayContaining(['TRUE', 'FALSE']));
    const compiled = compileAutomationArchitecture(workflow);
    const validation = validateWorkflowGraph(compiled);
    expect(validation.issues.filter((issue) => issue.severity === 'error'), JSON.stringify(validation.issues, null, 2)).toEqual([]);
    expect(compiled.nodes.some((node) => node.category === 'merge' && /priority/i.test(node.name))).toBe(true);
    expect(compiled.connections.every((edge) => compiled.nodes.some((node) => node.id === edge.sourceNodeId) && compiled.nodes.some((node) => node.id === edge.targetNodeId))).toBe(true);
    expect(workflow.connections.filter((edge) => edge.connectionKind && edge.connectionKind !== 'execution')).toHaveLength(4);
    expect(workflow.nodes.filter((node) => node.category === 'ai' && node.nodeKind !== 'ai-attachment')).toHaveLength(1);
    expect(compiled.nodes.filter((node) => node.category === 'ai' && node.nodeKind !== 'ai-attachment')).toHaveLength(1);
  });

  it('retains a real temporal wait in a semantic fallback', async () => {
    const workflow = await new LocalAnalysisProvider().analyze({
      scope: `${semanticSupportScope.replace('Continue to an IF condition', 'Wait five minutes.\nContinue to an IF condition')}`,
      projectName: 'Delayed Customer Support',
      platform: 'n8n',
    }) as CanonicalWorkflow;
    expect(workflow.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'delay', name: 'Wait five minutes' }),
    ]));
    expect(validateWorkflowGraph(compileAutomationArchitecture(workflow)).valid).toBe(true);
  });

  it('continues to reject invalid connection targets', async () => {
    const workflow = await new LocalAnalysisProvider().analyze({
      scope: semanticSupportScope,
      projectName: 'Invalid target guard',
      platform: 'n8n',
    }) as CanonicalWorkflow;
    workflow.connections[0] = { ...workflow.connections[0]!, targetNodeId: crypto.randomUUID() };
    expect(validateWorkflowGraph(workflow)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'MISSING_TARGET_NODE', severity: 'error' })]),
    });
  });

  it('ignores hiring prose and extracts explicit trigger/action requirements', async () => {
    const workflow = await new LocalAnalysisProvider().analyze({ scope, projectName: 'Asana CRM', platform: 'make' }) as CanonicalWorkflow;
    expect(workflow.nodes.map((node) => node.name).join(' ')).not.toMatch(/we are seeking|skilled make/i);
    expect(workflow.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'trigger', name: expect.stringMatching(/Ready to Start/) }),
      expect.objectContaining({ name: 'Create lead folder in Google Drive', service: 'Google Drive' }),
      expect.objectContaining({ name: 'Create Social Media Content subtask in Asana', service: 'Asana' }),
      expect.objectContaining({ name: 'Send personalized welcome email with PDF', category: 'email' }),
    ]));
    expect(workflow.nodes.filter((node) => node.category === 'trigger')).toHaveLength(2);
  });

  it('preserves multiline actions, binary branches, and an explicit delay', async () => {
    const workflow = await new LocalAnalysisProvider().analyze({ scope: detailedScope, projectName: 'Lead response', platform: 'n8n' }) as CanonicalWorkflow;

    expect(workflow.nodes).toHaveLength(12);
    expect(workflow.branches).toHaveLength(4);
    expect(workflow.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'trigger', name: expect.stringMatching(/lead enters/i) }),
      expect.objectContaining({ name: expect.stringMatching(/validate.*email/i), category: 'action', operation: 'Validate data', service: null }),
      expect.objectContaining({ category: 'condition', name: 'Is the email valid?' }),
      expect.objectContaining({ name: expect.stringMatching(/assign.*salesperson/i) }),
      expect.objectContaining({ name: expect.stringMatching(/welcome email/i) }),
      expect.objectContaining({ name: expect.stringMatching(/notify.*sales manager/i) }),
      expect.objectContaining({ name: expect.stringMatching(/manual review/i) }),
      expect.objectContaining({ category: 'delay', name: 'Wait three days' }),
      expect.objectContaining({ category: 'condition', name: 'Has the lead replied?' }),
      expect.objectContaining({ name: 'Send lead follow-up message' }),
    ]));
    expect(workflow.connections.filter((edge) => edge.branchLabel === 'TRUE')).toHaveLength(2);
    expect(workflow.connections.filter((edge) => edge.branchLabel === 'FALSE')).toHaveLength(2);
    expect(workflow.complexity).toBe('moderate');
  });

  it('preserves every numbered workflow-sequence step and ignores mapping instructions', async () => {
    const workflow = await new LocalAnalysisProvider().analyze({
      scope: explicitSequenceScope,
      projectName: 'Lead Qualification and Outreach Automation',
      platform: 'n8n',
    }) as CanonicalWorkflow;

    expect(workflow.nodes).toHaveLength(6);
    expect(workflow.connections).toHaveLength(5);
    expect(workflow.branches).toHaveLength(0);
    expect(workflow.nodes.map((node) => node.name)).toEqual([
      'Webhook: Receive data',
      'External API: Get company info',
      'Function: Score and prioritize lead',
      'Database: Store lead in SQL',
      'Email: Send notification',
      'LLM: Generate outreach email',
    ]);
    expect(workflow.nodes[0]).toMatchObject({ category: 'trigger', service: 'Webhook' });
    expect(workflow.nodes[1]).toMatchObject({ category: 'api_request', operation: 'Retrieve data' });
    expect(workflow.nodes[3]).toMatchObject({ category: 'database', operation: 'Create record' });
    expect(workflow.nodes.map((node) => node.name).join(' ')).not.toMatch(/explicit node|explicit connection|binary decisions/i);
  });

  it.each(['make', 'zapier', 'n8n'] as const)('preserves paired qualification branches for %s', async (platform) => {
    const naturalScope = `When a lead submits our website form, someone reviews it.

If the deal is marked as Not Qualified, send a thank-you email and close the opportunity.

If it is marked as Qualified, automatically generate a proposal using our Google Docs template.

If the folder does not exist, create it automatically.

Once the proposal is ready, notify the salesperson in Slack.`;
    const workflow = await new LocalAnalysisProvider().analyze({
      scope: naturalScope,
      projectName: 'Lead Management',
      platform,
    }) as CanonicalWorkflow;

    expect(workflow.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: expect.stringMatching(/generate.*proposal/i), operation: 'Generate document' }),
      expect.objectContaining({ name: expect.stringMatching(/thank-you email/i) }),
    ]));
    const qualification = workflow.nodes.find((node) => /Not Qualified/i.test(node.name))!;
    expect(workflow.connections.filter((edge) => edge.sourceNodeId === qualification.id).map((edge) => edge.branchLabel)).toEqual(expect.arrayContaining(['TRUE', 'FALSE']));
  });

  it.each([
    ['make', /Iterator/i, 'Make Flow Control', 'Iterator'],
    ['zapier', /Looping by Zapier/i, 'Looping by Zapier', 'Create Loop From Line Items'],
    ['n8n', /Split Out/i, 'n8n', 'Split Out'],
  ] as const)('adds the native %s collection iterator only for explicit collection processing', async (platform, expectedName, service, operation) => {
    const workflow = await new LocalAnalysisProvider().analyze({
      scope: 'When Gmail receives a message, retrieve the attachments. Upload each attachment to Google Drive. Notify Slack when processing is complete.',
      projectName: 'Attachment intake',
      platform,
    }) as CanonicalWorkflow;
    const compiled = compileAutomationArchitecture(workflow);
    const iterator = compiled.nodes.find((node) => node.category === 'loop');

    expect(iterator).toMatchObject({ name: expect.stringMatching(expectedName), service, operation });
    expect(compiled.connections.filter((edge) => edge.sourceNodeId === iterator?.id).map((edge) => edge.branchLabel)).toEqual(expect.arrayContaining(['LOOP', 'DONE']));
    expect(validateWorkflowGraph(compiled).valid).toBe(true);
  });

  it('does not iterate scalar fields from one webform submission', async () => {
    const workflow = await new LocalAnalysisProvider().analyze({
      scope: 'When a webform is submitted, retrieve the name and email. Add the submission to one Google Sheets row.',
      projectName: 'Webform intake',
      platform: 'make',
    }) as CanonicalWorkflow;

    expect(workflow.nodes.some((node) => node.category === 'loop')).toBe(false);
  });

  it('adds a router and default route only when more than two destinations are explicit', async () => {
    const workflow = await new LocalAnalysisProvider().analyze({
      scope: 'When a request arrives, validate it. Route requests by priority to High, Medium, or Low. Notify Slack.',
      projectName: 'Priority routing',
      platform: 'zapier',
    }) as CanonicalWorkflow;
    const compiled = compileAutomationArchitecture(workflow);
    const router = compiled.nodes.find((node) => node.category === 'router');
    const labels = compiled.connections.filter((edge) => edge.sourceNodeId === router?.id).map((edge) => edge.label);

    expect(labels).toEqual(expect.arrayContaining(['HIGH', 'MEDIUM', 'LOW', 'DEFAULT']));
    expect(compiled.nodes.some((node) => node.category === 'merge')).toBe(true);
    expect(validateWorkflowGraph(compiled).valid).toBe(true);
  });

  it('groups a large requirements portfolio into conceptual business capabilities', async () => {
    const section = (name: string, body: string) => `\n${name}\n\n${body}\n`;
    const scope = (`Property operations portfolio
${section('Inquiry Management', 'Whenever an inquiry arrives, create the contact. If the property is unavailable, send alternatives. Otherwise notify the leasing agent.')}
${section('Viewing Management', 'When a viewing is booked, create a calendar event. Send a reminder after 24 hours. If cancelled, notify the agent.')}
${section('Maintenance Management', 'Whenever a maintenance request arrives, create a ticket. If it is urgent, notify Slack. Otherwise assign the standard queue.')}
${section('Rent Collection', 'When rent is due, check whether payment was received. If unpaid, send a reminder. If paid, log the receipt.')}
${section('Owner Reporting', 'Every month, retrieve property results. For each property, create a report and send it to the owner.')}`).padEnd(10_500, ' supporting operational detail');

    const workflow = await new LocalAnalysisProvider().analyze({ scope, projectName: 'Property operations', platform: 'make' }) as CanonicalWorkflow;
    const compiled = compileAutomationArchitecture(workflow);

    const triggers = compiled.nodes.filter((node) => node.category === 'trigger');
    const workflowSet = createWorkflowSetFromGraph(compiled);
    expect(triggers.length).toBeGreaterThanOrEqual(2);
    expect(triggers.length).toBeLessThan(5);
    expect(workflowSet.workflows.length).toBe(triggers.length);
    expect(workflowSet.workflows.some((item) => item.name.includes('Leasing & Prospect Management'))).toBe(true);
    expect(triggers.some((node) => node.name === 'Inquiry Management')).toBe(false);
    expect(compiled.nodes.some((node) =>
      (node.configuration.compoundOperation === true && Array.isArray(node.configuration.groupedActions))
      || Array.isArray(node.configuration.branchActions))).toBe(true);
    expect(workflow.warnings.join(' ')).toMatch(/semantic compression reduced/i);
    const ownerByNode = new Map(workflowSet.nodeReferences.map((reference) => [reference.resourceId, reference.owningWorkflowId]));
    const stepCounts = workflowSet.workflows.map((entry) => compiled.nodes.filter((node) =>
      ownerByNode.get(node.id) === entry.id && !['start', 'trigger', 'end', 'note', 'group'].includes(node.category)).length);
    expect(stepCounts.filter((count) => count < 6).length / stepCounts.length).toBeLessThanOrEqual(0.3);
    expect(validateWorkflowGraph(compiled).valid).toBe(true);
  });

  it('keeps a large headed scope as one workflow when only one trigger is explicit', async () => {
    const scope = (`Trigger: When a signed request enters the operations queue.

Intake

Validate the request and retrieve the customer record.

Preparation

Create the workspace and prepare the standard project template.

Approval

Request manager approval and record the decision.

Delivery

Send the completed package and notify the account owner.`).padEnd(10_500, ' Additional implementation guidance belongs to the same triggered process.');

    expect(countIndependentWorkflowTriggers(scope)).toBe(1);
    expect(isLargeWorkflowPortfolio(scope)).toBe(false);
    const workflow = await new LocalAnalysisProvider().analyze({ scope, projectName: 'Single complex workflow', platform: 'make' }) as CanonicalWorkflow;
    expect(workflow.nodes.filter((node) => node.category === 'trigger')).toHaveLength(1);
  });

  it('partitions a scope only when it contains multiple independent triggers', () => {
    const scope = `Lead Intake

When a website form is submitted, enrich the lead and notify sales.

Invoice Follow-up

Every weekday, find overdue invoices and send payment reminders.`;

    expect(countIndependentWorkflowTriggers(scope)).toBe(2);
    expect(shouldPartitionWorkflowScope(scope)).toBe(true);
  });

  it('honors an explicit single-workflow requirement over multiple trigger-like sections', () => {
    const scope = `Create this as a single workflow without separate tabs.

Lead Intake

When a website form is submitted, enrich the lead and notify sales.

Invoice Follow-up

Every weekday, find overdue invoices and send payment reminders.`;

    expect(requestsSingleWorkflow(scope)).toBe(true);
    expect(countIndependentWorkflowTriggers(scope)).toBe(2);
    expect(shouldPartitionWorkflowScope(scope)).toBe(false);
  });

  it('allows the caller to force one workflow without altering the requirements text', () => {
    const scope = `Lead Intake

When a website form is submitted, enrich the lead and notify sales.

Invoice Follow-up

Every weekday, find overdue invoices and send payment reminders.`;

    expect(shouldPartitionWorkflowScope(scope)).toBe(true);
    expect(shouldPartitionWorkflowScope(scope, true)).toBe(false);
  });
});
