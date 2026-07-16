import { leadQualificationWorkflow } from '@awm/shared';
import { describe, expect, it } from 'vitest';
import { makeAdapter, n8nAdapter, zapierAdapter } from './index.js';

describe('platform adapters', () => {
  it.each([zapierAdapter, makeAdapter, n8nAdapter])('maps canonical nodes for $displayName', (adapter) => {
    const plan = adapter.buildPlan(leadQualificationWorkflow);
    expect(plan.nodes).toHaveLength(leadQualificationWorkflow.nodes.length);
    expect(plan.nodes[0]?.sourceNodeId).toBe(leadQualificationWorkflow.nodes[0]?.id);
    expect(plan.platform).toBe(adapter.platform);
    expect(plan.architectureNotes.length).toBeGreaterThan(0);
  });

  it('recommends a specific Zapier app event', () => {
    const plan = zapierAdapter.buildPlan(leadQualificationWorkflow);
    const hubspot = plan.nodes.find((node) => node.appName.toLowerCase() === 'hubspot');
    expect(hubspot?.event).toMatch(/Contact/);
    expect(hubspot?.requiredCredentials[0]).toContain('HubSpot');
  });

  it('infers a native Asana subtask action from the node title', () => {
    const workflow = structuredClone(leadQualificationWorkflow);
    workflow.nodes[1] = { ...workflow.nodes[1]!, category: 'action', name: 'Create Subtask in Asana', service: null, operation: null };
    const suggestion = n8nAdapter.buildPlan(workflow).nodes[1]!;
    expect(suggestion).toMatchObject({ appName: 'Asana', event: 'Task: Create (set Parent Task)', stepType: 'Asana node' });
    expect(suggestion.inputFields).toContain('Parent task ID');
    expect(suggestion.configurationNotes[0]).toMatch(/native Asana connector/i);
  });

  it('produces an actionable Gmail follow-up checklist', () => {
    const workflow = structuredClone(leadQualificationWorkflow);
    workflow.nodes[1] = { ...workflow.nodes[1]!, category: 'action', name: 'Send Follow-Up Message', description: 'Send a follow-up message to the lead via Gmail', service: 'gmail', operation: null, credentials: [] };
    const suggestion = n8nAdapter.buildPlan(workflow).nodes[1]!;
    expect(suggestion).toMatchObject({ appName: 'gmail', event: 'Message: Send', stepType: 'gmail node', requiredCredentials: ['Gmail OAuth2 credential'] });
    expect(suggestion.inputFields).toEqual(expect.arrayContaining(['Recipient email', 'Subject', 'Message body']));
    expect(suggestion.implementationSteps.join(' ')).toMatch(/recipient.*subject.*test/i);
  });
});
