import { describe, expect, it } from 'vitest';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { PlannerContextBuilder } from './planner-context-builder.js';
import {
  UnknownPlannerSymbolError,
  buildP36IntentInput,
  buildP36SkeletonInput,
  resolveP36Intent,
  resolveP36Skeleton,
} from './controlled-vocabulary.js';

const scope = 'When an Asana task moves to Ready, notify Slack.';
const analysis = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-16T00:00:00.000Z'));
const context = new PlannerContextBuilder().build(scope, 'n8n', analysis);
const built = buildP36IntentInput('run-1', scope, context, analysis.knowledgeContext.catalogVersion);

describe('controlled planner vocabulary', () => {
  it('builds deterministic namespace-scoped symbols', () => {
    const second = buildP36IntentInput('run-2', scope, context, analysis.knowledgeContext.catalogVersion);
    expect(second.table.value.snapshotHash).toBe(built.table.value.snapshotHash);
    expect(built.table.resolve('application', built.table.symbol('application', 'asana'))).toBe('asana');
    expect(() => built.table.resolve('fact', 999_999)).toThrow(UnknownPlannerSymbolError);
  });

  it('resolves controlled Stage A and Stage B wire artifacts to stable legacy artifacts', () => {
    const fact = built.input.facts[0]!;
    const evidence = fact.evidenceSymbols[0]!;
    const clarificationSymbols = built.input.clarifications.map((item) => item.symbol);
    const asana = built.table.symbol('application', 'asana');
    const intentWire = {
      businessObjective: 'Notify Slack when an Asana task is ready',
      actors: [], sourceApplicationSymbols: [asana], destinationApplicationSymbols: [],
      unresolvedSystems: ['Slack'], businessEntities: ['task'], businessOutcomes: ['Slack notified'],
      constraints: [], explicitBusinessRules: ['Only after Ready'], unresolvedClarificationSymbols: clarificationSymbols,
      decompositionHints: [], factSymbols: [fact.symbol], patternSymbols: [],
      workflowBoundaryCandidates: [{ title: 'Ready notification', purpose: 'Notify Slack', factSymbols: [fact.symbol] }],
    };
    const intent = resolveP36Intent(built.input, intentWire, built.table);
    expect(intent.factIds).toEqual([built.table.resolve('fact', fact.symbol)]);
    expect(intent.workflowBoundaryCandidates[0]?.temporaryId).toBe('boundary-1');

    const skeletonInput = buildP36SkeletonInput('run-1', context, intentWire, built.table);
    const triggerSlot = skeletonInput.roleSlots.findIndex((item) => item.role === 'workflow-trigger');
    const actionSlot = skeletonInput.roleSlots.findIndex((item) => item.allowedCanonicalFunctionSymbols.includes(built.table.symbol('canonical-function', 'action')));
    const skeleton = resolveP36Skeleton(skeletonInput, {
      workflows: [{
        title: 'Ready notification', boundaryIndex: 0, entryNodeIndex: 0, exitNodeIndexes: [1],
        nodes: [
          { roleSlotIndex: triggerSlot, semanticRole: 'workflow-trigger', inputShape: skeletonInput.roleSlots[triggerSlot]!.inputShape, outputShape: skeletonInput.roleSlots[triggerSlot]!.outputShape, canonicalFunctionSymbol: built.table.symbol('canonical-function', 'trigger'), title: 'Task ready', factSymbols: [fact.symbol], evidenceSymbols: [evidence], knowledgeSymbols: [], blockedByClarificationSymbols: [], unresolvedGroundingRequirements: [] },
          { roleSlotIndex: actionSlot, semanticRole: skeletonInput.roleSlots[actionSlot]!.role, inputShape: skeletonInput.roleSlots[actionSlot]!.inputShape, outputShape: skeletonInput.roleSlots[actionSlot]!.outputShape, canonicalFunctionSymbol: built.table.symbol('canonical-function', 'action'), title: 'Notify Slack', factSymbols: [fact.symbol], evidenceSymbols: [evidence], knowledgeSymbols: [], blockedByClarificationSymbols: clarificationSymbols, unresolvedGroundingRequirements: ['Ground Slack operation'] },
        ],
        edges: [{ sourceIndex: 0, targetIndex: 1, label: 'NEXT', role: 'flow', condition: null, evidenceSymbols: [evidence] }],
        binaryConditions: [], routers: [], loops: [], merges: [], aggregators: [], retries: [], blockingClarificationSymbols: clarificationSymbols,
      }],
    }, built.table);
    expect(skeleton.workflows[0]?.nodes.map((item) => item.canonicalFunctionId)).toEqual(['trigger', 'action']);
    expect(skeleton.workflows[0]?.edges[0]).toMatchObject({ sourceKey: 'node-1', targetKey: 'node-2' });
  });

  it('rejects invented symbols deterministically rather than repairing them', () => {
    expect(() => resolveP36Intent(built.input, {
      businessObjective: 'Invalid', actors: [], sourceApplicationSymbols: [999_999], destinationApplicationSymbols: [],
      unresolvedSystems: [], businessEntities: [], businessOutcomes: [], constraints: [], explicitBusinessRules: [],
      unresolvedClarificationSymbols: [], decompositionHints: [], factSymbols: [], patternSymbols: [],
      workflowBoundaryCandidates: [{ title: 'Invalid', purpose: 'Invalid', factSymbols: [] }],
    }, built.table)).toThrow(UnknownPlannerSymbolError);
  });
});
