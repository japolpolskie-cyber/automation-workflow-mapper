import { leadFollowUpWorkflowBrief, lockedDepartmentRoutingWorkflowBrief, minimumWorkflowBrief, safeParseCanonicalWorkflowBrief, type CanonicalWorkflowBrief } from '@awm/shared';
import { describe, expect, it } from 'vitest';
import * as publicKnowledge from './index.js';
import {
  binaryDecisionNodeFunctionContract,
  followUpLoopNodeFunctionContract,
  getNodeFunctionContract,
  hasNodeFunctionContract,
  listNodeFunctionContracts,
  nodeFunctionCatalogSchema,
  nodeFunctionContractSchema,
  parseNodeFunctionContract,
  pollingLoopNodeFunctionContract,
  retryNodeFunctionContract,
  returnToStepLoopNodeFunctionContract,
  revisionLoopNodeFunctionContract,
  routerNodeFunctionContract,
  safeParseNodeFunctionContract,
} from './node-function-catalog.js';

const expectedCatalogIds = [
  'trigger', 'action', 'binary-decision', 'router', 'filter', 'iterator', 'aggregator',
  'merge', 'wait', 'approval', 'retry', 'follow-up-loop', 'revision-loop', 'polling-loop',
  'return-to-step-loop', 'error-handler', 'sub-workflow', 'terminal', 'ai-agent',
  'ai-classification', 'ai-extraction', 'ai-summarization', 'ai-generation',
];

describe('conceptual node-function catalog', () => {
  it('contains every initial catalog ID exactly once', () => {
    const contracts = listNodeFunctionContracts();
    expect(contracts.map((contract) => contract.id).sort()).toEqual([...expectedCatalogIds].sort());
    expect(new Set(contracts.map((contract) => contract.id)).size).toBe(contracts.length);
  });

  it('parses every catalog entry', () => {
    for (const contract of listNodeFunctionContracts()) expect(parseNodeFunctionContract(contract)).toEqual(contract);
  });

  it('keeps the seven completed contracts detailed and unrelated entries at foundation status', () => {
    const detailedIds = new Set(['router', 'binary-decision', 'retry', 'follow-up-loop', 'revision-loop', 'polling-loop', 'return-to-step-loop']);
    for (const contract of listNodeFunctionContracts()) expect(contract.status).toBe(detailedIds.has(contract.id) ? 'detailed' : 'foundation');
  });

  it('supports normalized lookup, presence checks, and unknown IDs', () => {
    expect(getNodeFunctionContract(' ROUTER ')?.id).toBe('router');
    expect(hasNodeFunctionContract('Router')).toBe(true);
    expect(getNodeFunctionContract('unknown')).toBeUndefined();
    expect(hasNodeFunctionContract('unknown')).toBe(false);
  });

  it('does not expose mutable internal catalog data', () => {
    const router = getNodeFunctionContract('router')!;
    router.name = 'Changed';
    router.selectionCriteria.push('Changed criterion.');
    const list = listNodeFunctionContracts();
    list.splice(0, 1);
    expect(getNodeFunctionContract('router')?.name).toBe('Router');
    expect(getNodeFunctionContract('router')?.selectionCriteria).not.toContain('Changed criterion.');
    expect(listNodeFunctionContracts()).toHaveLength(expectedCatalogIds.length);
  });

  it('rejects duplicate catalog IDs', () => {
    expect(nodeFunctionCatalogSchema.safeParse([routerNodeFunctionContract, routerNodeFunctionContract]).success).toBe(false);
  });

  it('rejects unknown, platform-specific, and runtime implementation fields', () => {
    expect(safeParseNodeFunctionContract({ ...routerNodeFunctionContract, unexpected: true }).success).toBe(false);
    expect(safeParseNodeFunctionContract({ ...routerNodeFunctionContract, n8nNodeType: 'switch' }).success).toBe(false);
    expect(safeParseNodeFunctionContract({ ...routerNodeFunctionContract, name: 'Zapier Paths Router' }).success).toBe(false);
    expect(safeParseNodeFunctionContract({ ...routerNodeFunctionContract, runtimeConfiguration: {} }).success).toBe(false);
  });

  it('exports the catalog contract through the knowledge package index', () => {
    expect(publicKnowledge.nodeFunctionContractSchema).toBe(nodeFunctionContractSchema);
    expect(publicKnowledge.getNodeFunctionContract('router')).toEqual(routerNodeFunctionContract);
  });
});

const upgradedContracts = [
  binaryDecisionNodeFunctionContract,
  retryNodeFunctionContract,
  followUpLoopNodeFunctionContract,
  revisionLoopNodeFunctionContract,
  pollingLoopNodeFunctionContract,
  returnToStepLoopNodeFunctionContract,
];

describe('Binary Decision and Loop-family contracts', () => {
  it.each(upgradedContracts.map((contract) => [contract.id, contract] as const))('validates detailed contract %s', (_id, contract) => {
    expect(parseNodeFunctionContract(contract)).toEqual(contract);
    expect(contract.status).toBe('detailed');
    expect(contract.inputRequirements.some((input) => input.required)).toBe(true);
    expect(contract.outputRequirements.length).toBeGreaterThan(0);
    expect(contract.safeguards.length).toBeGreaterThan(0);
    expect(contract.positiveExamples.length).toBeGreaterThanOrEqual(2);
    expect(contract.negativeExamples.length).toBeGreaterThanOrEqual(2);
  });

  it('requires exactly two conceptual outcomes for Binary Decision', () => {
    const routes = binaryDecisionNodeFunctionContract.outputRequirements.find((output) => output.id === 'binary-routes')!;
    expect(routes.minimumCount).toBe(2);
    expect(routes.maximumCount).toBe(2);
    expect(binaryDecisionNodeFunctionContract.notes.join(' ')).toMatch(/TRUE and FALSE.*fallback/i);
  });

  it('excludes Router and parallel behavior from Binary Decision', () => {
    const exclusions = binaryDecisionNodeFunctionContract.negativeExamples.map((example) => example.expectedInterpretation).join(' ');
    expect(exclusions).toMatch(/Router/i);
    expect(exclusions).toMatch(/parallel/i);
  });

  it('requires bounded Retry and excludes Follow-up and Polling', () => {
    expect(retryNodeFunctionContract.inputRequirements.find((input) => input.id === 'maximum-attempts')).toMatchObject({ required: true });
    const exclusions = retryNodeFunctionContract.negativeExamples.map((example) => example.expectedInterpretation).join(' ');
    expect(exclusions).toMatch(/Follow-up Loop/i);
    expect(exclusions).toMatch(/Polling Loop/i);
  });

  it('preserves Follow-up cadence and response exits', () => {
    expect(followUpLoopNodeFunctionContract.inputRequirements.find((input) => input.id === 'cadence')).toMatchObject({ required: true });
    expect(followUpLoopNodeFunctionContract.outputRequirements.map((output) => output.id)).toEqual(expect.arrayContaining(['response-exit', 'no-response-exit']));
  });

  it('requires Revision to return work for changes', () => {
    expect(revisionLoopNodeFunctionContract.inputRequirements.map((input) => input.id)).toEqual(expect.arrayContaining(['revision-action', 'rereview-action']));
    expect(revisionLoopNodeFunctionContract.safeguards.some((safeguard) => safeguard.id === 'require-return-for-changes')).toBe(true);
  });

  it('requires Polling interval and bounded exit information', () => {
    expect(pollingLoopNodeFunctionContract.inputRequirements.find((input) => input.id === 'polling-interval')).toMatchObject({ required: true });
    expect(pollingLoopNodeFunctionContract.inputRequirements.find((input) => input.id === 'polling-bound')).toMatchObject({ required: true });
    expect(pollingLoopNodeFunctionContract.outputRequirements.some((output) => output.id === 'timeout-exit')).toBe(true);
  });

  it('requires Return-to-step to identify a named loop-back target', () => {
    expect(returnToStepLoopNodeFunctionContract.inputRequirements.find((input) => input.id === 'loop-back-target')).toMatchObject({ required: true });
    expect(returnToStepLoopNodeFunctionContract.safeguards.some((safeguard) => safeguard.id === 'actual-earlier-action')).toBe(true);
  });

  it('marks detailed examples consistently and contains no implementation terms', () => {
    const detailed = listNodeFunctionContracts().filter((contract) => contract.status === 'detailed');
    for (const contract of detailed) {
      expect(contract.positiveExamples.every((example) => example.valid)).toBe(true);
      expect(contract.negativeExamples.every((example) => !example.valid)).toBe(true);
      expect(JSON.stringify(contract)).not.toMatch(/n8n|make\.com|zapier|reactflow|nodeType|provider|modelId|runtime configuration/i);
    }
  });
});

const withLoop = (loop: CanonicalWorkflowBrief['loops'][number]): CanonicalWorkflowBrief => ({ ...structuredClone(minimumWorkflowBrief), loops: [loop] });

describe('Workflow Brief compatibility for detailed contracts', () => {
  it('aligns Binary Decision with a valid two-route Workflow Brief', () => {
    expect(safeParseCanonicalWorkflowBrief(leadFollowUpWorkflowBrief).success).toBe(true);
    expect(leadFollowUpWorkflowBrief.decisions[0]).toMatchObject({ decisionType: 'binary' });
    expect(leadFollowUpWorkflowBrief.decisions[0]?.routeIds).toHaveLength(2);
  });

  it('aligns Retry with the bounded lead follow-up fixture', () => {
    expect(safeParseCanonicalWorkflowBrief(leadFollowUpWorkflowBrief).success).toBe(true);
    expect(leadFollowUpWorkflowBrief.loops[0]).toMatchObject({ loopType: 'bounded-retry', maximumIterations: 3 });
  });

  it('aligns Follow-up and Return-to-step with valid Workflow Brief loop variants', () => {
    const followUp = structuredClone(leadFollowUpWorkflowBrief);
    followUp.loops[0] = { ...followUp.loops[0]!, loopType: 'follow-up', intervalDescription: 'Two days.' };
    expect(safeParseCanonicalWorkflowBrief(followUp).success).toBe(true);
    const returnToStep = structuredClone(leadFollowUpWorkflowBrief);
    returnToStep.loops[0] = { ...returnToStep.loops[0]!, loopType: 'return-to-step', loopBackActionId: 'qualify-lead' };
    expect(safeParseCanonicalWorkflowBrief(returnToStep).success).toBe(true);
  });

  it('keeps invalid bounded-retry, polling, and return-to-step briefs rejected', () => {
    const baseLoop = { id: 'loop-1', name: 'Repeat work', description: 'Repeat a bounded business action.', entryActionId: 'complete-work', bodyActionIds: ['complete-work'], exitCondition: 'Work completes.' };
    expect(safeParseCanonicalWorkflowBrief(withLoop({ ...baseLoop, loopType: 'bounded-retry' })).success).toBe(false);
    expect(safeParseCanonicalWorkflowBrief(withLoop({ ...baseLoop, loopType: 'polling' })).success).toBe(false);
    expect(safeParseCanonicalWorkflowBrief(withLoop({ ...baseLoop, loopType: 'return-to-step' })).success).toBe(false);
  });
});

describe('Router behavior contract', () => {
  it('parses as a valid detailed routing contract', () => {
    expect(parseNodeFunctionContract(routerNodeFunctionContract)).toEqual(routerNodeFunctionContract);
    expect(routerNodeFunctionContract.category).toBe('routing');
    expect(routerNodeFunctionContract.status).toBe('detailed');
  });

  it('requires semantic labels and prohibits generic labels', () => {
    const routes = routerNodeFunctionContract.outputRequirements.find((output) => output.id === 'semantic-routes')!;
    expect(routes.semanticLabelRequired).toBe(true);
    expect(routes.genericLabelsAllowed).toBe(false);
    expect(routes.minimumCount).toBeGreaterThanOrEqual(2);
    expect(routerNodeFunctionContract.negativeExamples.some((example) => /Output 1|Route 1|Branch 1|Path 1/i.test(example.requirementText) && !example.valid)).toBe(true);
  });

  it('marks every positive example valid', () => {
    expect(routerNodeFunctionContract.positiveExamples.every((example) => example.valid)).toBe(true);
  });

  it.each([
    ['binary decision', /binary decision/i],
    ['parallel execution', /parallel fan-out/i],
    ['iterator', /iterator/i],
    ['retry', /retry loop/i],
  ])('excludes %s examples', (_name, interpretation) => {
    expect(routerNodeFunctionContract.negativeExamples.some((example) => interpretation.test(example.expectedInterpretation) && !example.valid)).toBe(true);
  });

  it('contains no platform-specific implementation names', () => {
    expect(JSON.stringify(routerNodeFunctionContract)).not.toMatch(/n8n|make\.com|zapier|reactflow|nodeType/i);
  });

  it('maps conceptually to Workflow Brief decisions and routes', () => {
    expect(routerNodeFunctionContract.relatedWorkflowBriefEntityTypes).toEqual(expect.arrayContaining(['decision', 'route']));
  });

  it('aligns with the locked department-routing Workflow Brief fixture', () => {
    expect(safeParseCanonicalWorkflowBrief(lockedDepartmentRoutingWorkflowBrief).success).toBe(true);
    expect(lockedDepartmentRoutingWorkflowBrief.decisions[0]?.decisionType).toBe('multi-route');
    expect(lockedDepartmentRoutingWorkflowBrief.routes.map((route) => route.label)).toEqual(['IT', 'Marketing', 'Customer Support']);
  });

  it('aligns with Workflow Brief rejection of generic route labels', () => {
    const brief = structuredClone(lockedDepartmentRoutingWorkflowBrief);
    brief.routes[0]!.label = 'Route 1';
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(false);
  });
});
