import { aiChatbotDraftWorkflowBrief, collectionProcessingWorkflowBrief, departmentRoutingWorkflowBrief, humanApprovalWorkflowBrief, leadFollowUpWorkflowBrief, lockedDepartmentRoutingWorkflowBrief, minimumWorkflowBrief, safeParseCanonicalWorkflowBrief, websiteEnquiryWorkflowBrief, type CanonicalWorkflowBrief } from '@awm/shared';
import { describe, expect, it } from 'vitest';
import * as publicKnowledge from './index.js';
import {
  actionNodeFunctionContract,
  aggregatorNodeFunctionContract,
  aiAgentNodeFunctionContract,
  aiClassificationNodeFunctionContract,
  aiExtractionNodeFunctionContract,
  aiGenerationNodeFunctionContract,
  aiSummarizationNodeFunctionContract,
  approvalNodeFunctionContract,
  binaryDecisionNodeFunctionContract,
  errorHandlerNodeFunctionContract,
  filterNodeFunctionContract,
  followUpLoopNodeFunctionContract,
  getNodeFunctionContract,
  hasNodeFunctionContract,
  iteratorNodeFunctionContract,
  listNodeFunctionContracts,
  mergeNodeFunctionContract,
  nodeFunctionCatalogSchema,
  nodeFunctionContractSchema,
  parseNodeFunctionContract,
  pollingLoopNodeFunctionContract,
  retryNodeFunctionContract,
  returnToStepLoopNodeFunctionContract,
  revisionLoopNodeFunctionContract,
  routerNodeFunctionContract,
  safeParseNodeFunctionContract,
  subWorkflowNodeFunctionContract,
  terminalNodeFunctionContract,
  triggerNodeFunctionContract,
  waitNodeFunctionContract,
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

  it('keeps every catalog contract at detailed status', () => {
    expect(listNodeFunctionContracts().every((contract) => contract.status === 'detailed')).toBe(true);
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

const boundaryContracts = [
  waitNodeFunctionContract,
  approvalNodeFunctionContract,
  mergeNodeFunctionContract,
  iteratorNodeFunctionContract,
  aggregatorNodeFunctionContract,
];

describe('Wait, Approval, Merge, Iterator, and Aggregator contracts', () => {
  it.each(boundaryContracts.map((contract) => [contract.id, contract] as const))('validates detailed contract %s', (_id, contract) => {
    expect(parseNodeFunctionContract(contract)).toEqual(contract);
    expect(contract.status).toBe('detailed');
    expect(contract.inputRequirements.some((input) => input.required)).toBe(true);
    expect(contract.outputRequirements.length).toBeGreaterThan(0);
    expect(contract.safeguards.length).toBeGreaterThan(0);
    expect(contract.positiveExamples.every((example) => example.valid)).toBe(true);
    expect(contract.negativeExamples.every((example) => !example.valid)).toBe(true);
  });

  it('distinguishes Wait boundaries from Polling and Follow-up', () => {
    expect(waitNodeFunctionContract.inputRequirements.map((input) => input.id)).toEqual(expect.arrayContaining(['wait-type', 'boundary-description', 'resume-condition', 'resume-action', 'boundary-detail']));
    const excluded = waitNodeFunctionContract.negativeExamples.map((example) => example.expectedInterpretation).join(' ');
    expect(excluded).toMatch(/Polling Loop/i);
    expect(excluded).toMatch(/Follow-up Loop/i);
    expect(waitNodeFunctionContract.positiveExamples.map((example) => example.requirementText).join(' ')).toMatch(/three days|customer replies|manager approval|due date/i);
  });

  it('requires active human Approval and rejects descriptive approved status', () => {
    expect(approvalNodeFunctionContract.safeguards.some((safeguard) => safeguard.id === 'active-language')).toBe(true);
    expect(approvalNodeFunctionContract.inputRequirements.find((input) => input.id === 'approver-role')).toMatchObject({ required: true });
    expect(approvalNodeFunctionContract.negativeExamples.some((example) => /approved social posts/i.test(example.requirementText) && !example.valid)).toBe(true);
  });

  it('requires Merge to synchronize at least two branches with an explicit strategy', () => {
    expect(mergeNodeFunctionContract.outputRequirements.find((output) => output.id === 'incoming-boundary')?.minimumCount).toBe(2);
    expect(mergeNodeFunctionContract.inputRequirements.find((input) => input.id === 'merge-strategy')).toMatchObject({ required: true });
    expect(mergeNodeFunctionContract.notes.join(' ')).toMatch(/all, any, or first-completed/i);
  });

  it('keeps Merge and Aggregator conceptually distinct', () => {
    expect(mergeNodeFunctionContract.negativeExamples.some((example) => /Aggregator/i.test(example.expectedInterpretation))).toBe(true);
    expect(aggregatorNodeFunctionContract.negativeExamples.some((example) => /Merge/i.test(example.expectedInterpretation))).toBe(true);
    expect(mergeNodeFunctionContract.purpose).toMatch(/branches/i);
    expect(aggregatorNodeFunctionContract.purpose).toMatch(/collection processing/i);
  });

  it('requires Iterator collection semantics and excludes other loop families', () => {
    expect(iteratorNodeFunctionContract.inputRequirements.find((input) => input.id === 'source-collection')).toMatchObject({ required: true });
    const excluded = iteratorNodeFunctionContract.negativeExamples.map((example) => example.expectedInterpretation).join(' ');
    expect(excluded).toMatch(/Retry/i);
    expect(excluded).toMatch(/Follow-up Loop/i);
    expect(excluded).toMatch(/Polling Loop/i);
  });

  it('keeps Aggregator optional and tied to a source Iterator', () => {
    expect(aggregatorNodeFunctionContract.inputRequirements.find((input) => input.id === 'source-iterator')).toMatchObject({ required: true });
    expect(aggregatorNodeFunctionContract.safeguards.some((safeguard) => safeguard.id === 'not-automatic')).toBe(true);
    expect(iteratorNodeFunctionContract.outputRequirements.find((output) => output.id === 'aggregator-reference')).toMatchObject({ minimumCount: 0, maximumCount: 1 });
  });

  it('contains no implementation terms in any detailed contract', () => {
    for (const contract of listNodeFunctionContracts().filter((item) => item.status === 'detailed')) {
      expect(JSON.stringify(contract)).not.toMatch(/n8n|make\.com|zapier|reactflow|nodeType|provider|modelId|runtime configuration/i);
    }
  });
});

describe('Workflow Brief compatibility for boundary contracts', () => {
  it('aligns Wait with the valid lead-response boundary', () => {
    expect(safeParseCanonicalWorkflowBrief(leadFollowUpWorkflowBrief).success).toBe(true);
    expect(leadFollowUpWorkflowBrief.waits[0]).toMatchObject({ waitType: 'until-response', resumeActionId: 'qualify-lead' });
  });

  it('aligns Approval with the valid human-approval fixture', () => {
    expect(safeParseCanonicalWorkflowBrief(humanApprovalWorkflowBrief).success).toBe(true);
    expect(humanApprovalWorkflowBrief.approvals[0]).toMatchObject({ approverActorId: 'manager', approvedRouteId: 'expense-approved', rejectedRouteId: 'expense-rejected' });
  });

  it('aligns Merge with a valid merge-all Workflow Brief', () => {
    const brief = structuredClone(departmentRoutingWorkflowBrief);
    brief.merges = [{ id: 'department-merge', name: 'Rejoin department work', description: 'Continue after both selected department outcomes complete.', mergeType: 'all', incomingRouteIds: ['route-it', 'route-marketing'], targetActionId: 'handle-support' }];
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(true);
  });

  it('aligns Iterator and optional Aggregator with the collection fixture', () => {
    expect(safeParseCanonicalWorkflowBrief(collectionProcessingWorkflowBrief).success).toBe(true);
    expect(collectionProcessingWorkflowBrief.iterators[0]?.aggregatorId).toBe('result-aggregator');
    expect(collectionProcessingWorkflowBrief.aggregators[0]?.sourceIteratorId).toBe('document-iterator');
    const withoutAggregation = structuredClone(collectionProcessingWorkflowBrief);
    delete withoutAggregation.iterators[0]!.aggregatorId;
    withoutAggregation.aggregators = [];
    expect(safeParseCanonicalWorkflowBrief(withoutAggregation).success).toBe(true);
  });

  it('keeps invalid Wait, Approval, Merge, Iterator, and Aggregator briefs rejected', () => {
    const invalidWait = structuredClone(leadFollowUpWorkflowBrief);
    delete invalidWait.waits[0]!.eventDescription;
    expect(safeParseCanonicalWorkflowBrief(invalidWait).success).toBe(false);
    const invalidApproval = structuredClone(humanApprovalWorkflowBrief);
    invalidApproval.approvals[0] = { ...invalidApproval.approvals[0]!, name: 'Approved content', description: 'Content with approved status.' };
    expect(safeParseCanonicalWorkflowBrief(invalidApproval).success).toBe(false);
    const invalidMerge = structuredClone(departmentRoutingWorkflowBrief);
    invalidMerge.merges = [{ id: 'bad-merge', name: 'Bad merge', description: 'Invalid single route.', mergeType: 'all', incomingRouteIds: ['route-it'], targetActionId: 'handle-support' }];
    expect(safeParseCanonicalWorkflowBrief(invalidMerge).success).toBe(false);
    const invalidIterator = structuredClone(collectionProcessingWorkflowBrief);
    invalidIterator.iterators[0]!.sourceActionId = 'missing-action';
    expect(safeParseCanonicalWorkflowBrief(invalidIterator).success).toBe(false);
    const invalidAggregator = structuredClone(collectionProcessingWorkflowBrief);
    invalidAggregator.aggregators[0]!.sourceIteratorId = 'missing-iterator';
    expect(safeParseCanonicalWorkflowBrief(invalidAggregator).success).toBe(false);
  });
});

const executionContracts = [
  triggerNodeFunctionContract,
  actionNodeFunctionContract,
  filterNodeFunctionContract,
  errorHandlerNodeFunctionContract,
  subWorkflowNodeFunctionContract,
  terminalNodeFunctionContract,
];

describe('Trigger, Action, Filter, Error Handler, Sub-workflow, and Terminal contracts', () => {
  it.each(executionContracts.map((contract) => [contract.id, contract] as const))('validates detailed contract %s', (_id, contract) => {
    expect(parseNodeFunctionContract(contract)).toEqual(contract);
    expect(contract.status).toBe('detailed');
    expect(contract.inputRequirements.some((input) => input.required)).toBe(true);
    expect(contract.outputRequirements.length).toBeGreaterThan(0);
    expect(contract.safeguards.length).toBeGreaterThan(0);
    expect(contract.positiveExamples.every((example) => example.valid)).toBe(true);
    expect(contract.negativeExamples.every((example) => !example.valid)).toBe(true);
  });

  it('distinguishes Trigger from Wait, Polling, and Follow-up', () => {
    const excluded = triggerNodeFunctionContract.negativeExamples.map((example) => example.expectedInterpretation).join(' ');
    expect(excluded).toMatch(/Wait/i);
    expect(excluded).toMatch(/Polling Loop/i);
    expect(triggerNodeFunctionContract.exclusionCriteria.join(' ')).toMatch(/Follow-up Loop/i);
    expect(triggerNodeFunctionContract.outputRequirements.some((output) => output.id === 'start-boundary')).toBe(true);
  });

  it('requires one concrete Action and preserves application or actor context', () => {
    expect(actionNodeFunctionContract.inputRequirements.find((input) => input.id === 'operation')).toMatchObject({ required: true });
    expect(actionNodeFunctionContract.outputRequirements.find((output) => output.id === 'completed-operation')).toMatchObject({ maximumCount: 1 });
    expect(actionNodeFunctionContract.inputRequirements.some((input) => input.id === 'application-actor')).toBe(true);
    expect(actionNodeFunctionContract.safeguards.some((safeguard) => safeguard.id === 'preserve-context')).toBe(true);
  });

  it('keeps Filter distinct from Binary Decision and Router', () => {
    const excluded = filterNodeFunctionContract.negativeExamples.map((example) => example.expectedInterpretation).join(' ');
    expect(excluded).toMatch(/Binary Decision/i);
    expect(excluded).toMatch(/Router/i);
    expect(filterNodeFunctionContract.safeguards.some((safeguard) => safeguard.id === 'no-second-branch')).toBe(true);
  });

  it('distinguishes Error Handler from normal rejection and preserves retry exhaustion', () => {
    expect(errorHandlerNodeFunctionContract.negativeExamples.some((example) => /normal business outcome/i.test(example.expectedInterpretation))).toBe(true);
    expect(errorHandlerNodeFunctionContract.inputRequirements.some((input) => input.id === 'retry-relationship')).toBe(true);
    expect(errorHandlerNodeFunctionContract.safeguards.some((safeguard) => safeguard.id === 'preserve-exhaustion')).toBe(true);
  });

  it('requires reusable multi-step Sub-workflow boundaries and excludes actions and internal loops', () => {
    expect(subWorkflowNodeFunctionContract.inputRequirements.map((input) => input.id)).toEqual(expect.arrayContaining(['process-purpose', 'process-inputs', 'process-outputs']));
    const excluded = subWorkflowNodeFunctionContract.negativeExamples.map((example) => example.expectedInterpretation).join(' ');
    expect(excluded).toMatch(/Action/i);
    expect(excluded).toMatch(/Return-to-step Loop/i);
    expect(subWorkflowNodeFunctionContract.safeguards.some((safeguard) => safeguard.id === 'coherent-process')).toBe(true);
  });

  it('gives Terminal explicit finality with no continuation', () => {
    expect(terminalNodeFunctionContract.outputRequirements.find((output) => output.id === 'outgoing-continuation')).toMatchObject({ minimumCount: 0, maximumCount: 0 });
    expect(terminalNodeFunctionContract.safeguards.some((safeguard) => safeguard.id === 'no-continuation')).toBe(true);
    expect(terminalNodeFunctionContract.negativeExamples.some((example) => /Error Handler/i.test(example.expectedInterpretation))).toBe(true);
  });

  it('contains no implementation terms in the expanded detailed catalog', () => {
    for (const contract of listNodeFunctionContracts().filter((item) => item.status === 'detailed')) {
      expect(JSON.stringify(contract)).not.toMatch(/n8n|make\.com|zapier|reactflow|nodeType|provider|modelId|runtime configuration/i);
    }
  });
});

describe('Workflow Brief compatibility for execution contracts', () => {
  it('aligns Trigger and Action with existing valid fixtures', () => {
    expect(safeParseCanonicalWorkflowBrief(minimumWorkflowBrief).success).toBe(true);
    expect(minimumWorkflowBrief.triggers[0]?.triggerType).toBe('event');
    expect(minimumWorkflowBrief.actions[0]?.inputs).toEqual([]);
    expect(safeParseCanonicalWorkflowBrief(websiteEnquiryWorkflowBrief).success).toBe(true);
    expect(websiteEnquiryWorkflowBrief.triggers[0]?.applicationId).toBe('website');
    expect(websiteEnquiryWorkflowBrief.actions.some((action) => action.applicationId === 'crm')).toBe(true);
    expect(websiteEnquiryWorkflowBrief.actions.some((action) => action.actorId === 'sales-team')).toBe(true);
  });

  it('keeps Filter conceptual without adding a dedicated Workflow Brief entity', () => {
    expect(filterNodeFunctionContract.relatedWorkflowBriefEntityTypes).toEqual(expect.arrayContaining(['decision', 'route', 'action', 'iterator']));
    expect(listNodeFunctionContracts().some((contract) => contract.id === 'filter')).toBe(true);
  });

  it('keeps Error Handler, Sub-workflow, and Terminal at capability level', () => {
    for (const contract of [errorHandlerNodeFunctionContract, subWorkflowNodeFunctionContract, terminalNodeFunctionContract]) {
      expect(contract.relatedWorkflowBriefEntityTypes).toContain('capability');
    }
  });
});

const aiContracts = [
  aiAgentNodeFunctionContract,
  aiClassificationNodeFunctionContract,
  aiExtractionNodeFunctionContract,
  aiSummarizationNodeFunctionContract,
  aiGenerationNodeFunctionContract,
];

describe('conceptual AI behavior contracts', () => {
  it.each(aiContracts.map((contract) => [contract.id, contract] as const))('validates detailed contract %s', (_id, contract) => {
    expect(parseNodeFunctionContract(contract)).toEqual(contract);
    expect(contract.status).toBe('detailed');
    expect(contract.inputRequirements.some((input) => input.required)).toBe(true);
    expect(contract.outputRequirements.length).toBeGreaterThan(0);
    expect(contract.safeguards.length).toBeGreaterThan(0);
    expect(contract.positiveExamples.length).toBeGreaterThanOrEqual(3);
    expect(contract.negativeExamples.length).toBeGreaterThanOrEqual(3);
  });

  it('reserves AI Agent for open-ended, multi-step, dynamically selected bounded capabilities', () => {
    expect(aiAgentNodeFunctionContract.purpose).toMatch(/open-ended.*multi-step.*dynamic/i);
    expect(aiAgentNodeFunctionContract.inputRequirements.map((input) => input.id)).toEqual(expect.arrayContaining(['business-objective', 'capability-boundaries', 'completion-handoff', 'human-boundary', 'safety-limits', 'clarification-needs']));
    const exclusions = aiAgentNodeFunctionContract.negativeExamples.map((example) => example.expectedInterpretation).join(' ');
    expect(exclusions).toMatch(/AI Classification/i);
    expect(exclusions).toMatch(/AI Extraction/i);
    expect(exclusions).toMatch(/AI Summarization/i);
    expect(exclusions).toMatch(/AI Generation/i);
    expect(exclusions).toMatch(/Router/i);
    expect(exclusions).toMatch(/Action/i);
  });

  it('requires Classification to use a known category set and retain deterministic routing', () => {
    expect(aiClassificationNodeFunctionContract.inputRequirements.find((input) => input.id === 'allowed-categories')).toMatchObject({ required: true });
    expect(aiClassificationNodeFunctionContract.safeguards.map((safeguard) => safeguard.id)).toEqual(expect.arrayContaining(['known-categories', 'fallback-path', 'deterministic-first', 'separate-routing']));
  });

  it('requires Extraction to use defined fields without inventing missing values', () => {
    expect(aiExtractionNodeFunctionContract.inputRequirements.find((input) => input.id === 'required-fields')).toMatchObject({ required: true });
    expect(aiExtractionNodeFunctionContract.safeguards.map((safeguard) => safeguard.id)).toEqual(expect.arrayContaining(['defined-fields', 'no-invention', 'missing-versus-uncertain', 'structured-alternative']));
  });

  it('keeps Summarization faithful and distinct from fixed-field Extraction', () => {
    expect(aiSummarizationNodeFunctionContract.safeguards.map((safeguard) => safeguard.id)).toEqual(expect.arrayContaining(['no-unsupported-facts', 'preserve-critical', 'separate-extraction', 'state-uncertainty']));
    expect(aiSummarizationNodeFunctionContract.negativeExamples.some((example) => /AI Extraction/i.test(example.expectedInterpretation))).toBe(true);
  });

  it('limits Generation to one bounded artifact without delivery authority', () => {
    expect(aiGenerationNodeFunctionContract.outputRequirements.find((output) => output.id === 'generated-artifact')).toMatchObject({ minimumCount: 1, maximumCount: 1 });
    expect(aiGenerationNodeFunctionContract.safeguards.map((safeguard) => safeguard.id)).toEqual(expect.arrayContaining(['no-invented-facts', 'prefer-template', 'external-review', 'no-delivery-authority']));
  });

  it('contains no platform or runtime implementation language', () => {
    for (const contract of aiContracts) {
      expect(JSON.stringify(contract)).not.toMatch(/n8n|make\.com|zapier|reactflow|nodeType|provider|modelId|runtime configuration/i);
    }
  });
});

describe('Workflow Brief compatibility for conceptual AI contracts', () => {
  it('aligns AI Agent with the evidence-backed draft chatbot fixture', () => {
    expect(safeParseCanonicalWorkflowBrief(aiChatbotDraftWorkflowBrief).success).toBe(true);
    expect(aiChatbotDraftWorkflowBrief.capabilitySuggestions[0]).toMatchObject({ capabilityType: 'ai-agent' });
    expect(aiChatbotDraftWorkflowBrief.evidence.length).toBeGreaterThan(0);
    expect(aiChatbotDraftWorkflowBrief.confidence.length).toBeGreaterThan(0);
    expect(aiChatbotDraftWorkflowBrief.reviewDecisions.length).toBeGreaterThan(0);
    expect(aiChatbotDraftWorkflowBrief.clarificationQuestions.length).toBeGreaterThan(0);
  });

  it('allows a reviewed AI Agent capability to be locked without runtime details', () => {
    const brief = structuredClone(aiChatbotDraftWorkflowBrief);
    brief.reviewDecisions[0] = { ...brief.reviewDecisions[0]!, state: 'confirmed', reviewedBy: 'user', reviewedAt: '2026-08-01T00:00:00.000Z' };
    brief.reviewState = { status: 'locked', lockedAt: '2026-08-01T00:00:00.000Z', lockedBy: 'user', version: 1, notes: ['Conceptual capability reviewed.'] };
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(true);
  });

  it('rejects runtime AI configuration fields in a Workflow Brief capability', () => {
    const brief = structuredClone(aiChatbotDraftWorkflowBrief) as CanonicalWorkflowBrief & { capabilitySuggestions: Array<CanonicalWorkflowBrief['capabilitySuggestions'][number] & { model?: string; tools?: string[] }> };
    brief.capabilitySuggestions[0]!.model = 'runtime-choice';
    brief.capabilitySuggestions[0]!.tools = ['external-system'];
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(false);
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
