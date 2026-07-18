import { describe, expect, it } from 'vitest';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { PlannerContextBuilder } from './planner-context-builder.js';
import { PlannerPromptBuilder } from './planner-prompt-builder.js';
import { buildWorkflowAnalysisPrompt } from '../ai/prompts/workflow-analysis.js';

const scope = 'When an Asana task moves to Ready, retrieve task details. Find or create a Google Drive folder. Did the lead respond? If no, send a Gmail follow-up every 2 days, stop after 3 attempts, and escalate to the owner. Log one row in Google Sheets.';
const analysis = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-16T00:00:00.000Z'));

describe('K4 planner boundary', () => {
  it('contains approved planning inputs and strips observability metrics', () => {
    const context = new PlannerContextBuilder().build(scope, 'n8n', analysis); const serialized = JSON.stringify(context);
    expect(context.facts.length).toBeGreaterThan(0); expect(context.evidence.length).toBeGreaterThan(0); expect(context.knowledge.length + context.patterns.length).toBeGreaterThan(0);
    expect(serialized).not.toMatch(/"confidence"|"coverage"|"reliability"|"weight"|"weightedSupport"|"completenessPenalty"/);
  });

  it('retrieves capabilities and only catalog-supported operation IDs', () => {
    const context = new PlannerContextBuilder().build(scope, 'n8n', analysis);
    expect(context.capabilities.every((item) => item.id.startsWith('n8n.'))).toBe(true);
    expect(context.supportedOperations).toEqual(context.knowledge.filter((item) => item.kind === 'operation' && item.support !== 'unsupported').map((item) => item.id));
  });

  it('carries explicit platform limitations into planning knowledge', () => {
    const batchScope = 'Use Google Sheets to append multiple rows in one batch through the Sheets API.';
    const context = new PlannerContextBuilder().build(batchScope, 'zapier', new ScopeIntelligenceService().analyze(batchScope, new Date('2026-07-16T00:00:00.000Z')));
    const batch = context.knowledge.find((item) => item.id === 'google-sheets.append-rows-batch');
    expect(batch?.support).toBe('unsupported'); expect(batch?.limitations.join(' ')).toMatch(/does not expose|batch/i); expect(batch?.alternatives.length).toBeGreaterThan(0);
    expect(context.supportedOperations).not.toContain('google-sheets.append-rows-batch');
  });

  it('selects operations from their owning application clauses in a sequential scope', () => {
    const sequentialScope = 'Retrieve Asana task details, create a Google Drive folder, send a Gmail email, and add a row in Google Sheets.';
    const context = new PlannerContextBuilder().build(sequentialScope, 'n8n', new ScopeIntelligenceService().analyze(sequentialScope, new Date('2026-07-16T00:00:00.000Z')));
    expect(context.supportedOperations).toEqual(expect.arrayContaining([
      'asana.get-task-details',
      'google-drive.create-folder',
      'gmail.send-email',
      'google-sheets.add-row',
    ]));
  });

  it('builds a modular prompt without metric leakage', () => {
    const prompt = new PlannerPromptBuilder().build(new PlannerContextBuilder().build(scope, 'n8n', analysis));
    expect(prompt.sections.map((item) => item.name)).toEqual(['Planning Objective', 'Business Context', 'Planning Facts', 'Evidence References', 'Clarifications', 'Detected Patterns', 'Retrieved Knowledge', 'Allowed Operations', 'Planning Rules', 'Planner Constraints']);
    expect(prompt.user).not.toMatch(/"confidence"|"coverage"|"reliability"|benchmark metric|QA metric/i);
    expect(prompt.characterCount).toBe(prompt.system.length + prompt.user.length + prompt.sectionCharacterCounts['Output Schema']!);
  });

  it('adds isolated platform knowledge without leaking planner metrics', () => {
    const prompt = buildWorkflowAnalysisPrompt({ scope: 'Create an Asana task.', projectName: 'CRM', platform: 'n8n' });
    expect(prompt).toContain('Selected platform: n8n');
    expect(prompt).toContain('Create an Asana task.');
    expect(prompt).not.toMatch(/"confidence"|"coverage"|"reliability"|"weight"/);
    expect(prompt).not.toContain('Selected platform: make');
    expect(prompt).not.toContain('Selected platform: zapier');
  });
});
