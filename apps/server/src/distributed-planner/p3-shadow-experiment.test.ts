import { describe, expect, it } from 'vitest';
import { leadQualificationWorkflow, p3BusinessIntentInputSchema, p3BusinessIntentOutputSchema, p3ContractVersion, p3WorkflowSkeletonInputSchema, p3WorkflowSkeletonOutputSchema } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { PlannerContextBuilder } from '../planner/planner-context-builder.js';
import { buildP36IntentInput, buildP36SkeletonInput } from '../planner/controlled-vocabulary.js';
import { P3ShadowExperimentService } from './p3-shadow-experiment.js';
import { validateP3Intent, validateP3Skeleton } from './p3-stage-validator.js';
import type { PlannerStageRunnerFactory } from './p3-ollama-stage-runner.js';

const scope = 'When an Asana task moves to Ready, notify the sales team.';
const analysis = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-16T00:00:00.000Z'));
const context = new PlannerContextBuilder().build(scope, 'n8n', analysis);
const factId = context.facts[0]!.id; const evidenceId = context.evidence[0]!.id;
const intent = {
  businessObjective: 'Notify sales when an Asana task becomes ready', actors: ['sales team'], systems: ['Asana', 'Sales notification channel'],
  businessOutcomes: ['Sales is notified'], constraints: [], unresolvedQuestions: context.clarifications.map((item) => ({ clarificationId: item.id, question: item.question, blocking: true })),
  decompositionHints: ['Detect ready task', 'Notify sales'], factIds: [factId], knowledgeIds: [],
  sourceSystems: ['Asana'], destinationSystems: ['Sales notification channel'], businessEntities: ['task'],
  explicitBusinessRules: ['Notify only after the task is ready'],
  workflowBoundaryCandidates: [{ temporaryId: 'boundary-1', title: 'Ready task notification', purpose: 'Notify sales', factIds: [factId] }],
};
const skeleton = {
  workflows: [{
    temporaryWorkflowId: 'workflow-1', title: 'Ready task notification', boundaryCandidateId: 'boundary-1', entryNodeKey: 'node-1', exitNodeKeys: ['node-2'],
    nodes: [
      { key: 'node-1', canonicalFunctionId: 'trigger', title: 'Task becomes ready', blockedByClarificationIds: [], unresolvedGroundingRequirements: ['Select supported Asana trigger'], factIds: [factId], evidenceIds: [evidenceId], knowledgeIds: [] },
      { key: 'node-2', canonicalFunctionId: 'action', title: 'Notify sales', blockedByClarificationIds: context.clarifications.map((item) => item.id), unresolvedGroundingRequirements: ['Select notification application'], factIds: [factId], evidenceIds: [evidenceId], knowledgeIds: [] },
    ],
    edges: [{ key: 'edge-1', sourceKey: 'node-1', targetKey: 'node-2', label: 'NEXT', condition: null, evidenceIds: [evidenceId] }],
    binaryConditions: [], routers: [], loops: [], merges: [], blockingClarificationIds: context.clarifications.map((item) => item.id),
  }],
};
const { table } = buildP36IntentInput('test', scope, context, analysis.knowledgeContext.catalogVersion);
const asanaSymbol = table.symbol('application', 'asana');
const factSymbol = table.symbol('fact', factId);
const evidenceSymbol = table.symbol('evidence', evidenceId);
const clarificationSymbols = context.clarifications.map((item) => table.symbol('clarification', item.id));
const wireIntent = {
  businessObjective: 'Notify sales when an Asana task becomes ready',
  actors: ['sales team'],
  sourceApplicationSymbols: [asanaSymbol],
  destinationApplicationSymbols: [],
  unresolvedSystems: ['Sales notification channel'],
  businessEntities: ['task'],
  businessOutcomes: ['Sales is notified'],
  constraints: [],
  explicitBusinessRules: ['Notify only after the task is ready'],
  unresolvedClarificationSymbols: clarificationSymbols,
  decompositionHints: ['Detect ready task', 'Notify sales'],
  factSymbols: [factSymbol],
  patternSymbols: [],
  workflowBoundaryCandidates: [{ title: 'Ready task notification', purpose: 'Notify sales', factSymbols: [factSymbol] }],
};
const wireSkeletonInput = buildP36SkeletonInput('test', context, wireIntent, table);
const triggerSlotIndex = wireSkeletonInput.roleSlots.findIndex((item) => item.role === 'workflow-trigger');
const actionSlotIndex = wireSkeletonInput.roleSlots.findIndex((item) => item.role === 'notification');
const wireSkeleton = {
  workflows: [{
    title: 'Ready task notification', boundaryIndex: 0, entryNodeIndex: 0, exitNodeIndexes: [1],
    nodes: [
      { roleSlotIndex: triggerSlotIndex, semanticRole: 'workflow-trigger', inputShape: wireSkeletonInput.roleSlots[triggerSlotIndex]!.inputShape, outputShape: wireSkeletonInput.roleSlots[triggerSlotIndex]!.outputShape, canonicalFunctionSymbol: table.symbol('canonical-function', 'trigger'), title: 'Task becomes ready', blockedByClarificationSymbols: [], unresolvedGroundingRequirements: ['Select supported Asana trigger'], factSymbols: [factSymbol], evidenceSymbols: [evidenceSymbol], knowledgeSymbols: [] },
      { roleSlotIndex: actionSlotIndex, semanticRole: wireSkeletonInput.roleSlots[actionSlotIndex]!.role, inputShape: wireSkeletonInput.roleSlots[actionSlotIndex]!.inputShape, outputShape: wireSkeletonInput.roleSlots[actionSlotIndex]!.outputShape, canonicalFunctionSymbol: table.symbol('canonical-function', 'action'), title: 'Notify sales', blockedByClarificationSymbols: clarificationSymbols, unresolvedGroundingRequirements: ['Select notification application'], factSymbols: [factSymbol], evidenceSymbols: [evidenceSymbol], knowledgeSymbols: [] },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1, label: 'NEXT', role: 'flow', condition: null, evidenceSymbols: [evidenceSymbol] }],
    binaryConditions: [], routers: [], loops: [], merges: [], aggregators: [], retries: [], blockingClarificationSymbols: clarificationSymbols,
  }],
};

class TestRunnerFactory implements PlannerStageRunnerFactory {
  public readonly calls = { intent: 0, skeleton: 0 };
  public constructor(private readonly malformedSkeletonOnce = false) {}
  public create(stageName: 'business-intent' | 'workflow-skeleton') {
    return {
      runnerId: `test.${stageName}`, modelId: 'test-model', metrics: [],
      run: async () => {
        if (stageName === 'business-intent') { this.calls.intent += 1; return wireIntent; }
        this.calls.skeleton += 1;
        return this.malformedSkeletonOnce && this.calls.skeleton === 1 ? {} : wireSkeleton;
      },
    };
  }
}

describe('P3 strict Stage A/B validation', () => {
  it('accepts referenced intent and skeleton artifacts without observability or operation grounding', () => {
    const intentInput = p3BusinessIntentInputSchema.parse({ contractVersion: p3ContractVersion, runId: 'r', rawScope: scope, platform: 'n8n', facts: context.facts, clarifications: context.clarifications, patterns: context.patterns, evidence: context.evidence });
    const parsedIntent = p3BusinessIntentOutputSchema.parse(intent);
    expect(validateP3Intent(intentInput, parsedIntent)).toEqual([]);
    const skeletonInput = p3WorkflowSkeletonInputSchema.parse({ contractVersion: p3ContractVersion, runId: 'r', platform: 'n8n', intent: parsedIntent, facts: context.facts, evidence: context.evidence, clarifications: context.clarifications, patterns: context.patterns, allowedCanonicalFunctions: context.allowedCanonicalFunctions, topologyConstraints: ['Binary TRUE/FALSE'] });
    expect(validateP3Skeleton(skeletonInput, p3WorkflowSkeletonOutputSchema.parse(skeleton))).toEqual([]);
  });

  it('rejects missing false paths, unsupported canonical functions, invented operations, and dropped clarification', () => {
    const parsedIntent = p3BusinessIntentOutputSchema.parse(intent);
    const skeletonInput = p3WorkflowSkeletonInputSchema.parse({ contractVersion: p3ContractVersion, runId: 'r', platform: 'n8n', intent: parsedIntent, facts: context.facts, evidence: context.evidence, clarifications: [...context.clarifications, { id: 'clarification-owner', category: 'owner', question: 'Who owns escalation?', reason: 'Owner missing.', missingFact: 'escalation owner', evidenceIds: [] }], patterns: context.patterns, allowedCanonicalFunctions: context.allowedCanonicalFunctions, topologyConstraints: ['Binary TRUE/FALSE'] });
    const invalid = p3WorkflowSkeletonOutputSchema.parse(structuredClone(skeleton));
    invalid.workflows[0]!.nodes[0]!.canonicalFunctionId = 'invented-function';
    invalid.workflows[0]!.nodes[0]!.title = 'asana.create-task';
    invalid.workflows[0]!.blockingClarificationIds = [];
    invalid.workflows[0]!.nodes.forEach((node) => { node.blockedByClarificationIds = []; });
    invalid.workflows[0]!.binaryConditions = [{ nodeKey: 'node-1', trueEdgeKey: 'edge-1', falseEdgeKey: 'missing' }];
    const codes = validateP3Skeleton(skeletonInput, p3WorkflowSkeletonOutputSchema.parse(invalid)).map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining(['INVALID_CANONICAL_FUNCTION', 'INVALID_BINARY_TOPOLOGY', 'DROPPED_CLARIFICATION', 'OPERATION_GROUNDING_FORBIDDEN']));
  });
});

describe('P3 shadow experiment', () => {
  it('uses the P2 orchestrator, returns typed artifacts, and leaves production untouched', async () => {
    const runners = new TestRunnerFactory();
    const before = structuredClone(leadQualificationWorkflow);
    const result = await new P3ShadowExperimentService({ stageATimeoutMs: 1_000, stageBTimeoutMs: 1_000, totalTimeoutMs: 3_000, maximumRetries: 1, maximumOutputCharacters: 60_000, cacheEnabled: true }, runners).run(scope, 'n8n', analysis, before);
    expect(result.intent).toEqual(intent); expect(result.skeleton).toEqual(skeleton); expect(result.report.stageSequence).toEqual(['stage-a-intent', 'stage-b-skeleton']);
    expect(result.productionWorkflowUnchanged).toBe(true); expect(result.persisted).toBe(false); expect(before).toEqual(leadQualificationWorkflow);
    expect(runners.calls).toEqual({ intent: 1, skeleton: 1 });
  });

  it('retries malformed Stage B only and reuses successful Stage A', async () => {
    const runners = new TestRunnerFactory(true);
    const result = await new P3ShadowExperimentService({ stageATimeoutMs: 1_000, stageBTimeoutMs: 1_000, totalTimeoutMs: 3_000, maximumRetries: 1, maximumOutputCharacters: 60_000, cacheEnabled: false }, runners).run(scope, 'n8n', analysis, leadQualificationWorkflow);
    expect(runners.calls.intent).toBe(1); expect(runners.calls.skeleton).toBe(2); expect(result.report.stages.find((item) => item.stageInstanceId === 'stage-b-skeleton')?.attempts).toBe(2);
  });
});
