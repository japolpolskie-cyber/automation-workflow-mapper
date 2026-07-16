import { describe, expect, it } from 'vitest';
import type { P36WorkflowSkeletonInput, P36WorkflowSkeletonOutput, PlannerSemanticRole, SemanticRoleSlot } from '@awm/shared';
import { validateP37SemanticSkeleton } from './p3-semantic-validator.js';

const slot = (role: PlannerSemanticRole, symbol: number, inputShape: SemanticRoleSlot['inputShape'], outputShape: SemanticRoleSlot['outputShape']): SemanticRoleSlot => ({
  slotId: role, role, allowedCanonicalFunctionSymbols: [symbol], inputShape, outputShape,
  factSymbols: [], clarificationSymbols: [], patternSymbols: [], reason: 'Deterministic test assignment.',
});
const slots = [
  slot('workflow-trigger', 1, 'none', 'single'),
  slot('binary-decision', 2, 'single', 'branches'),
  slot('multi-route-decision', 3, 'single', 'branches'),
  slot('collection-iterator', 4, 'collection', 'single'),
  slot('business-loop', 5, 'single', 'single'),
  slot('technical-retry', 6, 'single', 'single'),
  slot('branch-merge', 7, 'branches', 'single'),
  slot('item-aggregator', 8, 'item-results', 'single'),
  slot('delay-boundary', 9, 'single', 'single'),
  slot('data-transformation', 10, 'single', 'single'),
  slot('successful-end', 11, 'single', 'none'),
];
const input = { roleSlots: slots } as P36WorkflowSkeletonInput;
const node = (roleSlotIndex: number, title: string = slots[roleSlotIndex]!.role) => ({
  roleSlotIndex, semanticRole: slots[roleSlotIndex]!.role, canonicalFunctionSymbol: slots[roleSlotIndex]!.allowedCanonicalFunctionSymbols[0]!,
  inputShape: slots[roleSlotIndex]!.inputShape, outputShape: slots[roleSlotIndex]!.outputShape, title,
  factSymbols: [], evidenceSymbols: [], knowledgeSymbols: [], blockedByClarificationSymbols: [], unresolvedGroundingRequirements: [],
});
const base = (): P36WorkflowSkeletonOutput => ({
  workflows: [{
    title: 'Test', boundaryIndex: 0, entryNodeIndex: 0, exitNodeIndexes: [2],
    nodes: [node(0), node(9), node(10)],
    edges: [
      { sourceIndex: 0, targetIndex: 1, label: 'NEXT', role: 'flow', condition: null, evidenceSymbols: [] },
      { sourceIndex: 1, targetIndex: 2, label: 'NEXT', role: 'flow', condition: null, evidenceSymbols: [] },
    ],
    binaryConditions: [], routers: [], loops: [], merges: [], aggregators: [], retries: [], blockingClarificationSymbols: [],
  }],
});
const codes = (output: P36WorkflowSkeletonOutput) => validateP37SemanticSkeleton(input, output).map((item) => item.code);

describe('P3.7 semantic role and topology validation', () => {
  it('rejects a valid canonical symbol selected through the wrong role slot', () => {
    const output = base(); output.workflows[0]!.nodes[1]!.canonicalFunctionSymbol = 1;
    expect(codes(output)).toContain('CANONICAL_FUNCTION_ROLE_MISMATCH');
  });

  it('rejects an iterator on a proven single-item path', () => {
    const output = base(); output.workflows[0]!.nodes[1] = { ...node(3), inputShape: 'single' };
    expect(codes(output)).toEqual(expect.arrayContaining(['ROLE_INPUT_SHAPE_MISMATCH', 'ITERATOR_REQUIRES_COLLECTION']));
  });

  it('requires distinct TRUE and FALSE destinations for a binary decision', () => {
    const output = base(); output.workflows[0]!.nodes[1] = node(1);
    output.workflows[0]!.edges = [
      { sourceIndex: 0, targetIndex: 1, label: 'NEXT', role: 'flow', condition: null, evidenceSymbols: [] },
      { sourceIndex: 1, targetIndex: 2, label: 'TRUE', role: 'true', condition: 'yes', evidenceSymbols: [] },
      { sourceIndex: 1, targetIndex: 2, label: 'FALSE', role: 'false', condition: 'no', evidenceSymbols: [] },
    ];
    output.workflows[0]!.binaryConditions = [{ nodeIndex: 1, trueEdgeIndex: 1, falseEdgeIndex: 2 }];
    expect(codes(output)).toContain('DUPLICATE_BINARY_DESTINATION');
  });

  it('distinguishes a multi-route router from a two-outcome decision', () => {
    const output = base(); output.workflows[0]!.nodes[1] = node(2);
    output.workflows[0]!.routers = [{ nodeIndex: 1, routes: [
      { label: 'A', condition: 'A', destinationNodeIndex: 2, edgeIndex: 1 },
      { label: 'B', condition: 'B', destinationNodeIndex: 2, edgeIndex: 1 },
    ] }];
    expect(codes(output)).toEqual(expect.arrayContaining(['ROUTER_REQUIRES_MULTIPLE_ROUTES', 'DUPLICATE_ROUTE_DESTINATION']));
  });

  it('distinguishes merge from aggregator and requires distinct branches', () => {
    const output = base(); output.workflows[0]!.nodes[1] = node(6);
    output.workflows[0]!.merges = [{ nodeIndex: 1, incomingEdgeIndexes: [0, 0], continuationEdgeIndex: 1 }];
    expect(codes(output)).toContain('MERGE_REQUIRES_DISTINCT_BRANCHES');
    output.workflows[0]!.aggregators = [{ nodeIndex: 1, itemSourceNodeIndex: 0, aggregationMethod: 'collect', continuationEdgeIndex: 1 }];
    expect(codes(output)).toContain('AGGREGATOR_ROLE_MISMATCH');
  });

  it('keeps business loops separate from retry and requires explicit boundaries', () => {
    const output = base(); output.workflows[0]!.nodes[1] = node(4);
    output.workflows[0]!.loops = [{ nodeIndex: 1, entryEdgeIndex: 0, bodyEntryNodeIndex: 2, bodyExitNodeIndex: 2, exitEdgeIndex: 1, stopBoundary: '' }];
    output.workflows[0]!.retries = [{ nodeIndex: 1, failedOperationNodeIndex: 2, retryEdgeIndex: 1, exhaustedEdgeIndex: 1, attemptLimit: null, missingLimitClarificationSymbol: null }];
    expect(codes(output)).toEqual(expect.arrayContaining(['BUSINESS_LOOP_AS_RETRY', 'LOOP_TOPOLOGY_INCOMPLETE', 'LOOP_STOP_BOUNDARY_MISSING', 'RETRY_ROLE_MISMATCH', 'RETRY_LIMIT_UNRESOLVED']));
  });

  it('requires a duration, date, event, or clarification for delay', () => {
    const output = base(); output.workflows[0]!.nodes[1] = node(8, 'Wait');
    expect(codes(output)).toContain('DELAY_BOUNDARY_MISSING');
    output.workflows[0]!.nodes[1]!.title = 'Wait 2 days';
    expect(codes(output)).not.toContain('DELAY_BOUNDARY_MISSING');
  });

  it('forbids incoming trigger edges and outgoing terminal edges', () => {
    const output = base(); output.workflows[0]!.nodes.push(node(10));
    output.workflows[0]!.edges.push({ sourceIndex: 3, targetIndex: 0, label: 'BAD', role: 'flow', condition: null, evidenceSymbols: [] });
    output.workflows[0]!.edges.push({ sourceIndex: 3, targetIndex: 2, label: 'BAD', role: 'flow', condition: null, evidenceSymbols: [] });
    expect(codes(output)).toEqual(expect.arrayContaining(['TRIGGER_HAS_INCOMING_EDGE', 'END_HAS_OUTGOING_EDGE']));
  });
});
