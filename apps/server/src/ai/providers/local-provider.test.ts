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
});
