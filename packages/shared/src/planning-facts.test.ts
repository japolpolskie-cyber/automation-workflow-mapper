import { describe, expect, it } from 'vitest';
import { leadQualificationWorkflow } from './fixtures.js';
import { planningFactsSchema, workflowSetPreviewSchema } from './planning-facts.js';

describe('planning contracts', () => {
  it('rejects facts that reference evidence outside the contract', () => {
    const result = planningFactsSchema.safeParse({ version: '1.0', objective: 'Route leads', applications: [{ applicationId: 'asana', name: 'Asana', confidence: 1, evidenceIds: ['00000000-0000-4000-8000-000000000099'] }], createdAt: '2026-07-16T00:00:00.000Z' });
    expect(result.success).toBe(false);
  });

  it('supports a future multi-workflow preview without changing the persisted project model', () => {
    const preview = workflowSetPreviewSchema.parse({ version: '1.0', id: '00000000-0000-4000-8000-000000000090', name: 'Lead operations', workflows: [leadQualificationWorkflow] });
    expect(preview.workflows).toHaveLength(1);
    expect(preview.workflows[0]?.id).toBe(leadQualificationWorkflow.id);
  });
});

describe('real-world benchmark: Asana CRM lifecycle automation', () => {
  it('represents applications, decisions, collections, rules, evidence, and clarification needs', () => {
    const evidence = {
      stage: '70000000-0000-4000-8000-000000000001',
      services: '70000000-0000-4000-8000-000000000002',
      followUp: '70000000-0000-4000-8000-000000000003',
      attachments: '70000000-0000-4000-8000-000000000004',
    } as const;
    const facts = planningFactsSchema.parse({
      version: '1.0',
      objective: 'Automate the Asana lead lifecycle from intake through onboarding.',
      applications: [
        { applicationId: 'asana', name: 'Asana', confidence: 1, evidenceIds: [evidence.stage] },
        { applicationId: 'google-drive', name: 'Google Drive', confidence: .98, evidenceIds: [evidence.attachments] },
        { applicationId: 'gmail', name: 'Gmail', confidence: .96, evidenceIds: [evidence.followUp] },
      ],
      entities: [
        { id: 'lead', name: 'Lead', entityType: 'crm_record', cardinality: 'single', confidence: .99, evidenceIds: [evidence.stage] },
        { id: 'attachments', name: 'Lead attachments', entityType: 'file', cardinality: 'collection', confidence: .95, evidenceIds: [evidence.attachments] },
      ],
      decisions: [{ id: 'response-check', decisionType: 'binary', question: 'Did the lead respond?', outcomes: ['Responded', 'No response'], confidence: .99, evidenceIds: [evidence.followUp] }],
      businessRules: [
        { id: 'ready-trigger', ruleType: 'trigger', statement: 'Start when an Asana task enters Ready to Start.', confidence: 1, evidenceIds: [evidence.stage] },
        { id: 'follow-up-limit', ruleType: 'repetition', statement: 'Follow up until the lead responds or the attempt limit is reached.', confidence: .98, evidenceIds: [evidence.followUp] },
      ],
      clarifications: [{ id: '70000000-0000-4000-8000-000000000010', question: 'How many follow-up attempts are allowed?', reason: 'The scope requires a finite follow-up sequence but does not state its boundary.', category: 'timing', importance: 'required', evidenceIds: [evidence.followUp] }],
      evidence: [
        { id: evidence.stage, source: 'scope', quote: 'When an Asana lead moves to Ready to Start' },
        { id: evidence.services, source: 'scope', quote: 'route by installed service type' },
        { id: evidence.followUp, source: 'scope', quote: 'send Gmail follow-ups until the lead responds' },
        { id: evidence.attachments, source: 'scope', quote: 'upload every attachment to the Google Drive lead folder' },
      ],
      assumptions: [],
      createdAt: '2026-07-16T00:00:00.000Z',
    });
    expect(facts.applications.map((item) => item.applicationId)).toEqual(['asana', 'google-drive', 'gmail']);
    expect(facts.entities.find((item) => item.id === 'attachments')?.cardinality).toBe('collection');
    expect(facts.decisions[0]?.outcomes).toEqual(['Responded', 'No response']);
    expect(facts.clarifications[0]).toMatchObject({ category: 'timing', importance: 'required', status: 'open' });
  });
});
