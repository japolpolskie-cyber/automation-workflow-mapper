import { describe, expect, it } from 'vitest';
import { p36BusinessIntentOutputSchema, p36WorkflowSkeletonOutputSchema } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { PlannerContextBuilder } from '../planner/planner-context-builder.js';
import { buildP36IntentInput, buildP36SkeletonInput } from '../planner/controlled-vocabulary.js';
import { buildControlledOutputSchema } from './controlled-output-schema.js';

describe('controlled provider output schema', () => {
  it('constrains every symbol field to its deterministic namespace values', () => {
    const scope = 'When an Asana task arrives, notify Slack.';
    const analysis = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-16T00:00:00.000Z'));
    const context = new PlannerContextBuilder().build(scope, 'n8n', analysis);
    const { input, table } = buildP36IntentInput('run', scope, context, analysis.knowledgeContext.catalogVersion);
    const schema = buildControlledOutputSchema(p36BusinessIntentOutputSchema, input);
    const properties = schema.properties as Record<string, { items?: { enum?: number[] } }>;
    expect(properties.sourceApplicationSymbols?.items?.enum).toEqual(table.value.namespaces.application!.map((item) => item.symbol));
    expect(properties.factSymbols?.items?.enum).toEqual(table.value.namespaces.fact!.map((item) => item.symbol));
    expect(properties.unresolvedClarificationSymbols?.items?.enum).toEqual(table.value.namespaces.clarification!.map((item) => item.symbol));
    expect(properties.patternSymbols?.items?.enum).toEqual(table.value.namespaces.pattern!.map((item) => item.symbol));
  });

  it('emits role-slot-specific canonical choices for Stage B', () => {
    const scope = 'When an Asana task arrives, notify Slack.';
    const analysis = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-16T00:00:00.000Z'));
    const context = new PlannerContextBuilder().build(scope, 'n8n', analysis);
    const { input, table } = buildP36IntentInput('run', scope, context, analysis.knowledgeContext.catalogVersion);
    const fact = input.facts[0]!;
    const intent = {
      businessObjective: scope, actors: [], sourceApplicationSymbols: [table.symbol('application', 'asana')],
      destinationApplicationSymbols: [], unresolvedSystems: ['Slack'], businessEntities: ['task'],
      businessOutcomes: ['notified'], constraints: [], explicitBusinessRules: [],
      unresolvedClarificationSymbols: input.clarifications.map((item) => item.symbol), decompositionHints: [],
      factSymbols: [fact.symbol], patternSymbols: [],
      workflowBoundaryCandidates: [{ title: 'Notification', purpose: 'Notify', factSymbols: [fact.symbol] }],
    };
    const skeletonInput = buildP36SkeletonInput('run', context, intent, table);
    const serialized = JSON.stringify(buildControlledOutputSchema(p36WorkflowSkeletonOutputSchema, skeletonInput));
    for (const [index, roleSlot] of skeletonInput.roleSlots.entries()) {
      expect(serialized).toContain(`"roleSlotIndex":{"enum":[${index}]}`);
      expect(serialized).toContain(`"semanticRole":{"enum":["${roleSlot.role}"]}`);
      expect(serialized).toContain(`"canonicalFunctionSymbol":{"enum":[${roleSlot.allowedCanonicalFunctionSymbols.join(',')}]}`);
    }
  });
});
