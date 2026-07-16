import { describe, expect, it } from 'vitest';
import { leadQualificationWorkflow, type P36BusinessIntentInput } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import type { PlannerStageRunnerFactory } from '../distributed-planner/p3-ollama-stage-runner.js';
import { P4DeterministicPlannerService } from './p4-deterministic-planner-service.js';

class IntentOnlyFactory implements PlannerStageRunnerFactory {
  public stages: string[] = [];
  public create(stageName: 'business-intent' | 'workflow-skeleton') {
    this.stages.push(stageName);
    return {
      runnerId: 'p4-test', modelId: 'business-model', metrics: [],
      run: async (value: unknown) => {
        const input = value as P36BusinessIntentInput;
        return {
          businessObjective: 'Follow up until response',
          actors: ['sales team'],
          sourceApplicationSymbols: input.symbolTable.namespaces.application?.slice(0, 1).map((item) => item.symbol) ?? [],
          destinationApplicationSymbols: [],
          unresolvedSystems: [],
          businessEntities: ['lead'],
          businessOutcomes: ['response received'],
          constraints: [],
          explicitBusinessRules: ['Stop when the lead responds.'],
          unresolvedClarificationSymbols: input.clarifications.map((item) => item.symbol),
          decompositionHints: ['Follow up', 'Check response'],
          factSymbols: input.facts.map((item) => item.symbol),
          patternSymbols: input.patterns.map((item) => item.symbol),
          workflowBoundaryCandidates: [{ title: 'Lead follow-up', purpose: 'Follow up until response', factSymbols: input.facts.map((item) => item.symbol) }],
        };
      },
    };
  }
}

describe('P4 deterministic planner service', () => {
  it('uses AI only for Stage A and compiles topology in software', async () => {
    const scope = 'When an Asana lead enters No Response, follow up until response. The interval, attempt limit, channel, and escalation policy are not specified.';
    const analysis = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-16T00:00:00.000Z'));
    const factory = new IntentOnlyFactory();
    const result = await new P4DeterministicPlannerService(factory).run(scope, 'n8n', analysis, leadQualificationWorkflow);
    expect(factory.stages).toEqual(['business-intent']);
    expect(result.status).toBe('blocked');
    expect(result.compilerIssues).toEqual([]);
    expect(result.plan?.loops).toHaveLength(1);
    expect(result.plan?.nodes.some((node) => node.canonicalFunctionId === 'end')).toBe(true);
    expect(result.metrics.retryCount).toBe(0);
    expect(result.productionWorkflowUnchanged).toBe(true);
    expect(result.persisted).toBe(false);
  });
});
