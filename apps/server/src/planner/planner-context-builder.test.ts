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

  it('builds a modular prompt without metric leakage', () => {
    const prompt = new PlannerPromptBuilder().build(new PlannerContextBuilder().build(scope, 'n8n', analysis));
    expect(prompt.sections.map((item) => item.name)).toEqual(['Planning Objective', 'Business Context', 'Planning Facts', 'Evidence References', 'Clarifications', 'Detected Patterns', 'Retrieved Knowledge', 'Allowed Operations', 'Planning Rules', 'Planner Constraints']);
    expect(prompt.user).not.toMatch(/"confidence"|"coverage"|"reliability"|benchmark metric|QA metric/i);
    expect(prompt.characterCount).toBe(prompt.system.length + prompt.user.length + prompt.sectionCharacterCounts['Output Schema']!);
  });

  it('does not alter the existing production prompt', () => {
    expect(buildWorkflowAnalysisPrompt({ scope: 'Create an Asana task.', projectName: 'CRM', platform: 'n8n' })).toBe('Project: CRM\nPreferred implementation platform: n8n\nThe canonical architecture itself must remain platform-neutral.\n\nUNTRUSTED SCOPE OF WORK START\nCreate an Asana task.\nUNTRUSTED SCOPE OF WORK END\n\nDesign a professional automation architecture. Include assumptions and clarification questions where business facts are missing. Return only the workflow JSON.');
  });
});
