import {
  groundedEdgeSchema,
  stageDGroundingContractVersion,
  type GroundedEdge,
  type StageDEdgeGroundingInput,
  type StageDEdgeType,
} from '@awm/shared';

export interface StageDModelSelection {
  edgeTypeSymbol: number;
  conditionSummary: string;
  dataFlowCategories: string[];
  reason: string;
}

export interface StageDModelSelector {
  readonly modelId: string;
  select(input: StageDEdgeGroundingInput, signal: AbortSignal): Promise<StageDModelSelection>;
}

export interface StageDGroundingOutcome {
  edge: GroundedEdge;
  deterministicLatencyMs: number;
  modelLatencyMs: number;
}

const edgeTypeSymbols: Record<StageDEdgeType, number> = {
  sequence: 1, true: 2, false: 3, route: 4, 'fallback-route': 5,
  'collection-input': 6, 'current-item': 7, 'next-item': 8, completion: 9,
  'loop-entry': 10, 'loop-continue': 11, 'loop-back': 12, 'loop-exit': 13,
  'merge-input': 14, 'merge-continuation': 15, 'item-result': 16,
  'aggregated-result': 17, failure: 18, retry: 19, 'retry-exhausted': 20,
  'delayed-continuation': 21, 'approval-approved': 22, 'approval-rejected': 23,
  unresolved: 24,
};

const genericLabels = new Set(['next', 'path 1', 'branch a', 'success', 'continue']);

export class StageDEdgeGrounder {
  public constructor(private readonly modelSelector: StageDModelSelector | null = null) {}

  public async ground(input: StageDEdgeGroundingInput, signal: AbortSignal): Promise<StageDGroundingOutcome> {
    const started = performance.now();
    const edgeType = this.resolveType(input);
    if (edgeType) {
      const unresolved = this.requiresClarification(input, edgeType);
      const edge = unresolved
        ? this.unresolved(input, edgeType, unresolved)
        : this.resolved(input, edgeType, 'deterministic', ['P4 topology role and K3.1 business semantics uniquely determine this transition.']);
      return { edge, deterministicLatencyMs: performance.now() - started, modelLatencyMs: 0 };
    }
    if (!this.modelSelector) {
      return { edge: this.unresolved(input, 'unresolved', 'Multiple edge meanings remain and no optional bounded model selector is configured.'), deterministicLatencyMs: performance.now() - started, modelLatencyMs: 0 };
    }
    const modelStarted = performance.now();
    const selection = await this.modelSelector.select(input, signal);
    const selected = Object.entries(edgeTypeSymbols).find(([, symbol]) => symbol === selection.edgeTypeSymbol)?.[0] as StageDEdgeType | undefined;
    if (!selected || !input.allowedEdgeTypes.includes(selected)) throw new Error(`Model selected unknown or disallowed edge symbol ${selection.edgeTypeSymbol}.`);
    const edge = this.resolved(input, selected, 'model-selected', ['Optional model selected only from the bounded edge vocabulary.', selection.reason], selection.conditionSummary, selection.dataFlowCategories);
    return { edge, deterministicLatencyMs: modelStarted - started, modelLatencyMs: performance.now() - modelStarted };
  }

  private resolveType(input: StageDEdgeGroundingInput): StageDEdgeType | null {
    const role = input.topologyRole.toLowerCase();
    const label = input.topologyLabel.toLowerCase();
    const allowed = (type: StageDEdgeType) => input.allowedEdgeTypes.includes(type) ? type : null;
    if (role !== 'sequence') return allowed(role as StageDEdgeType);
    if (label === 'true' || label === 'yes' || input.topologyCondition === 'true') return allowed('true');
    if (label === 'false' || label === 'no' || input.topologyCondition === 'false') return allowed('false');
    if (input.sourceCanonicalFunction === 'delay') return allowed('delayed-continuation');
    if (input.targetCanonicalFunction === 'iterator') return allowed('collection-input');
    if (input.sourceCanonicalFunction === 'iterator') return allowed(label === 'item' ? 'current-item' : label === 'done' ? 'completion' : 'next-item');
    if (input.targetCanonicalFunction === 'merge') return allowed('merge-input');
    if (input.sourceCanonicalFunction === 'merge') return allowed('merge-continuation');
    if (input.targetCanonicalFunction === 'aggregator') return allowed('item-result');
    if (input.sourceCanonicalFunction === 'aggregator') return allowed('aggregated-result');
    if (input.sourceCanonicalFunction === 'retry') return allowed(label.includes('exhaust') ? 'retry-exhausted' : 'retry');
    return allowed('sequence');
  }

  private requiresClarification(input: StageDEdgeGroundingInput, type: StageDEdgeType): string | null {
    if (!input.blockingClarificationReferences.length) return null;
    if (['true', 'false', 'route', 'fallback-route', 'loop-exit', 'loop-back', 'retry', 'retry-exhausted'].includes(type)
      && (!input.topologyCondition || genericLabels.has(input.topologyCondition.toLowerCase()))) {
      return 'The transition meaning depends on an unresolved business clarification.';
    }
    return null;
  }

  private resolved(
    input: StageDEdgeGroundingInput,
    edgeType: StageDEdgeType,
    method: 'deterministic' | 'model-selected',
    provenance: string[],
    modelCondition?: string,
    modelData?: string[],
  ): GroundedEdge {
    const semantics = this.semantics(input, edgeType);
    return groundedEdgeSchema.parse({
      contractVersion: stageDGroundingContractVersion,
      edgeId: input.edgeId, sourceNodeId: input.sourceNodeId, targetNodeId: input.targetNodeId,
      edgeType, sourceHandle: semantics.sourceHandle, targetHandle: semantics.targetHandle,
      displayLabel: semantics.label, conditionSummary: modelCondition ?? semantics.condition,
      businessReason: semantics.reason, dataContractSummary: modelData ?? this.dataContract(input, edgeType),
      sourceCardinality: input.sourceCardinality, targetCardinality: input.targetCardinality,
      cardinalityRelationship: this.cardinalityRelationship(input, edgeType),
      factReferences: input.relevantFacts.map((fact) => fact.id), evidenceReferences: input.evidenceReferences,
      patternReferences: input.patternReferences, clarificationReferences: input.blockingClarificationReferences,
      capabilityLimitationReferences: input.capabilityLimitations, groundingMethod: method,
      groundingProvenance: provenance, validationStatus: 'valid', unresolvedRequirement: null,
      selectedEdgeTypeSymbol: edgeTypeSymbols[edgeType],
    });
  }

  private unresolved(input: StageDEdgeGroundingInput, edgeType: StageDEdgeType, reason: string): GroundedEdge {
    const semantics = this.semantics(input, edgeType);
    return groundedEdgeSchema.parse({
      contractVersion: stageDGroundingContractVersion,
      edgeId: input.edgeId, sourceNodeId: input.sourceNodeId, targetNodeId: input.targetNodeId,
      edgeType, sourceHandle: semantics.sourceHandle, targetHandle: semantics.targetHandle,
      displayLabel: semantics.label, conditionSummary: null, businessReason: input.topologyPurpose,
      dataContractSummary: [], sourceCardinality: input.sourceCardinality, targetCardinality: input.targetCardinality,
      cardinalityRelationship: this.cardinalityRelationship(input, edgeType),
      factReferences: input.relevantFacts.map((fact) => fact.id), evidenceReferences: input.evidenceReferences,
      patternReferences: input.patternReferences, clarificationReferences: input.blockingClarificationReferences,
      capabilityLimitationReferences: input.capabilityLimitations, groundingMethod: 'unresolved',
      groundingProvenance: ['No missing business meaning was invented.'], validationStatus: 'unresolved',
      unresolvedRequirement: reason, selectedEdgeTypeSymbol: null,
    });
  }

  private semantics(input: StageDEdgeGroundingInput, type: StageDEdgeType): { sourceHandle: string; targetHandle: string; label: string; condition: string | null; reason: string } {
    const decision = input.sourceGrounding.purpose.replace(/\?$/, '');
    const routeLabel = input.topologyLabel;
    const map: Partial<Record<StageDEdgeType, [string, string, string, string | null]>> = {
      true: ['true', 'input', `Yes — ${decision}`, `${decision} is true based on the qualifying business event.`],
      false: ['false', 'input', `No — ${decision}`, `${decision} is false; the qualifying business event is absent.`],
      route: [`route:${routeLabel}`, 'input', routeLabel, input.topologyCondition ?? `The route value is ${routeLabel}.`],
      'fallback-route': ['fallback', 'input', routeLabel.toLowerCase().includes('unknown') ? routeLabel : `Unknown — ${routeLabel}`, input.topologyCondition ?? 'No named route matches.'],
      'collection-input': ['collection', 'collection', 'Collection to iterate', 'A collection is available for item processing.'],
      'current-item': ['item', 'input', 'Current item', 'Pass only the current collection item.'],
      'next-item': ['next-item', 'loop', 'Next item', 'More collection items remain.'],
      completion: ['done', 'input', 'Collection complete', 'No collection items remain.'],
      'loop-entry': ['entry', 'input', 'Enter loop', input.topologyCondition],
      'loop-continue': ['continue', 'input', 'Continue loop', input.topologyCondition],
      'loop-back': ['loop-back', 'loop', 'Evaluate next iteration', input.topologyCondition],
      'loop-exit': ['exit', 'input', 'Exit loop', input.topologyCondition],
      'merge-input': ['branch-result', 'branch', `Merge input — ${routeLabel}`, input.topologyCondition],
      'merge-continuation': ['merged', 'input', 'Merged result', null],
      'item-result': ['item-result', 'collection', 'Item result', null],
      'aggregated-result': ['aggregated', 'input', 'Aggregated result', null],
      failure: ['failure', 'input', 'Technical failure', input.topologyCondition],
      retry: ['retry', 'input', 'Retry failed operation', input.topologyCondition],
      'retry-exhausted': ['exhausted', 'input', 'Retry limit exhausted', input.topologyCondition],
      'delayed-continuation': ['after-wait', 'input', 'After bounded wait', input.topologyCondition],
      'approval-approved': ['approved', 'input', 'Approved', input.topologyCondition],
      'approval-rejected': ['rejected', 'input', 'Rejected', input.topologyCondition],
      sequence: ['output', 'input', this.sequenceLabel(input), input.topologyCondition],
    };
    const selected = map[type] ?? ['output', 'input', input.topologyLabel, input.topologyCondition];
    return { sourceHandle: selected[0], targetHandle: selected[1], label: selected[2], condition: selected[3], reason: input.topologyPurpose };
  }

  private sequenceLabel(input: StageDEdgeGroundingInput): string {
    if (!genericLabels.has(input.topologyLabel.toLowerCase())) return input.topologyLabel;
    return `${input.sourceGrounding.purpose} → ${input.targetGrounding.purpose}`;
  }

  private dataContract(input: StageDEdgeGroundingInput, type: StageDEdgeType): string[] {
    if (type === 'current-item') return ['current item only'];
    if (type === 'collection-input') return ['detected collection'];
    if (type === 'item-result') return ['repeated item results'];
    if (type === 'aggregated-result') return ['aggregated collection result'];
    const outputs = input.sourceGrounding.semanticOutputs;
    if (outputs.length) return outputs.map((item) => item.replace(/([A-Z])/g, ' $1').trim());
    if (input.sourceGrounding.operationId === 'create-folder') return ['folder identifier', 'folder URL'];
    return ['previous step result'];
  }

  private cardinalityRelationship(input: StageDEdgeGroundingInput, type: StageDEdgeType): string {
    if (type === 'current-item') return 'collection item → single item';
    if (type === 'collection-input') return 'collection → iterator collection input';
    if (type === 'item-result') return 'repeated single results → collection';
    if (type === 'merge-input') return 'branch result → branch convergence';
    return `${input.sourceCardinality} → ${input.targetCardinality}`;
  }
}

export { edgeTypeSymbols };
