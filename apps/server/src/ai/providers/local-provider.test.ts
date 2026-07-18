import { describe, expect, it } from 'vitest';
import type { CanonicalWorkflow } from '@awm/shared';
import { LocalAnalysisProvider } from './local-provider.js';

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

describe('LocalAnalysisProvider operational fallback', () => {
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
});
