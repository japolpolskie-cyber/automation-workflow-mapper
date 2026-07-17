import { KNOWLEDGE_CATALOG_VERSION } from '@awm/knowledge';
import {
  groundedEdgeSchema,
  stageDEdgeGroundingInputSchema,
  stageDGroundingContractVersion,
  stageDGroundingReportSchema,
  type GroundedEdge,
  type GroundedNode,
  type PlannerContext,
  type StageDEdgeGroundingInput,
  type StageDEdgeType,
  type StageDGroundingReport,
  type StructuredWorkflowPlan,
} from '@awm/shared';
import { DistributedPlannerOrchestrator, DistributedStageError, type DistributedStageDefinition, type ModelNeutralStageRunner } from '../distributed-planner/distributed-planner-orchestrator.js';
import { contentHash, InMemoryStageCache } from '../distributed-planner/stage-cache.js';
import { edgeTypeSymbols, StageDEdgeGrounder, type StageDModelSelector } from './stage-d-edge-grounder.js';

export interface StageDGroundingOptions {
  enabled: boolean; maximumConcurrency: number; edgeTimeoutMs: number;
  maximumRetries: number; cacheEnabled: boolean; maximumOutputCharacters: number;
}

interface CachedEdge { edge: GroundedEdge; deterministicLatencyMs: number; modelLatencyMs: number }

class EdgeRunner implements ModelNeutralStageRunner {
  public readonly runnerId = 'stage-d.edge-grounder';
  public readonly modelId: string | null;
  public constructor(
    selector: StageDModelSelector | null, private readonly input: StageDEdgeGroundingInput,
    private readonly cache: Map<string, CachedEdge>, private readonly key: string,
    private readonly cacheEnabled: boolean, private readonly capture: Map<string, CachedEdge>,
    private readonly stats: { hits: number; misses: number },
  ) { this.modelId = selector?.modelId ?? null; this.grounder = new StageDEdgeGrounder(selector); }
  private readonly grounder: StageDEdgeGrounder;
  public async run(_input: unknown, context: Parameters<ModelNeutralStageRunner['run']>[1]): Promise<unknown> {
    const cached = this.cacheEnabled ? this.cache.get(this.key) : undefined;
    if (cached) { this.stats.hits += 1; this.capture.set(this.input.edgeId, structuredClone(cached)); return cached.edge; }
    this.stats.misses += 1;
    try {
      const outcome = await this.grounder.ground(this.input, context.signal);
      const value = { edge: outcome.edge, deterministicLatencyMs: outcome.deterministicLatencyMs, modelLatencyMs: outcome.modelLatencyMs };
      if (this.cacheEnabled) this.cache.set(this.key, structuredClone(value));
      this.capture.set(this.input.edgeId, value);
      return value.edge;
    } catch (error) {
      throw new DistributedStageError('invalid-output', error instanceof Error ? error.message : 'Edge grounding failed.', true);
    }
  }
}

export class StageDGroundingService {
  private readonly cache = new Map<string, CachedEdge>();
  public constructor(private readonly options: StageDGroundingOptions, private readonly modelSelector: StageDModelSelector | null = null) {}

  public async ground(plan: StructuredWorkflowPlan, nodes: GroundedNode[], context: PlannerContext, signal?: AbortSignal): Promise<StageDGroundingReport> {
    const topologyBefore = this.topologyHash(plan);
    const nodesBefore = contentHash(nodes);
    if (!this.options.enabled) return this.report('completed', topologyBefore, topologyBefore, nodesBefore, nodesBefore, [], [], { hits: 0, misses: 0 }, [], 0);
    const inputs = plan.edges.map((edge) => this.inputFor(plan, nodes, context, edge.id));
    const captured = new Map<string, CachedEdge>();
    const cacheStats = { hits: 0, misses: 0 };
    const orchestrator = new DistributedPlannerOrchestrator({
      totalTimeoutMs: Math.max(this.options.edgeTimeoutMs, this.options.edgeTimeoutMs * Math.ceil(Math.max(1, inputs.length) / this.options.maximumConcurrency)),
      maximumConcurrency: this.options.maximumConcurrency, cacheEnabled: false,
    }, new InMemoryStageCache());
    for (const input of inputs) {
      const key = contentHash({
        edgeTopologyHash: contentHash({ id: input.edgeId, source: input.sourceNodeId, target: input.targetNodeId, role: input.topologyRole }),
        sourceGroundingHash: contentHash(input.sourceGrounding), targetGroundingHash: contentHash(input.targetGrounding),
        factHash: contentHash(input.relevantFacts), evidenceHash: contentHash(input.evidenceReferences),
        patternVersion: input.patternVersion, platform: input.platform, capabilityVersion: input.capabilityVersion,
        symbolTableSnapshotHash: input.symbolTableSnapshotHash, contractVersion: input.contractVersion,
        modelIdentity: this.modelSelector?.modelId ?? null,
      });
      const definition: DistributedStageDefinition = {
        contractVersion: '2.0.0', instanceId: `stage-d-${input.edgeId}`, stageId: 'edge-grounding',
        version: stageDGroundingContractVersion, inputContractVersion: stageDGroundingContractVersion,
        enabled: true, dependencies: [], timeoutMs: this.options.edgeTimeoutMs,
        retryPolicy: { maximumRetries: this.options.maximumRetries, retryableCategories: ['invalid-output', 'malformed-model-output'] },
        cachePolicy: { enabled: false }, inputSchema: stageDEdgeGroundingInputSchema, outputSchema: groundedEdgeSchema,
        buildInput: () => input,
        runner: new EdgeRunner(this.modelSelector, input, this.cache, key, this.options.cacheEnabled, captured, cacheStats),
      };
      orchestrator.register(definition);
    }
    const orchestration = await orchestrator.run({
      rawScope: context.objective, normalizedScopeHash: contentHash(context.objective),
      platform: context.platform, detectorVersion: context.version, catalogVersion: KNOWLEDGE_CATALOG_VERSION,
    }, { ...(signal ? { signal } : {}) });
    const edges = inputs.map((input) => captured.get(input.edgeId)?.edge ?? this.failedEdge(input, orchestration.stages.find((stage) => stage.stageInstanceId === `stage-d-${input.edgeId}`)?.failure?.cause ?? 'Edge grounding task did not complete.'));
    const issues = edges.flatMap((edge) => this.validateEdge(plan, context, edge, inputs.find((input) => input.edgeId === edge.edgeId)!));
    issues.push(...this.validateGraph(plan, edges));
    const topologyAfter = this.topologyHash(plan);
    const nodesAfter = contentHash(nodes);
    if (topologyBefore !== topologyAfter) issues.push({ code: 'STAGE_D_TOPOLOGY_MUTATION', edgeId: null, message: 'Stage D changed P4 topology.' });
    if (nodesBefore !== nodesAfter) issues.push({ code: 'STAGE_D_STAGE_C_MUTATION', edgeId: null, message: 'Stage D changed Stage C grounding.' });
    const retries = orchestration.stages.reduce((sum, stage) => sum + Math.max(0, stage.attempts - 1), 0);
    const status = signal?.aborted ? 'cancelled' : issues.length ? 'failed' : edges.some((edge) => edge.groundingMethod === 'unresolved') ? 'partial' : 'completed';
    return this.report(status, topologyBefore, topologyAfter, nodesBefore, nodesAfter, edges, issues, cacheStats, [...captured.values()], retries);
  }

  private inputFor(plan: StructuredWorkflowPlan, nodes: GroundedNode[], context: PlannerContext, edgeId: string): StageDEdgeGroundingInput {
    const edge = plan.edges.find((item) => item.id === edgeId)!;
    const sourcePlan = plan.nodes.find((node) => node.id === edge.source)!;
    const targetPlan = plan.nodes.find((node) => node.id === edge.target)!;
    const source = nodes.find((node) => node.nodeId === edge.source) ?? this.placeholder(sourcePlan.id, sourcePlan.canonicalFunctionId, sourcePlan.title);
    const target = nodes.find((node) => node.nodeId === edge.target) ?? this.placeholder(targetPlan.id, targetPlan.canonicalFunctionId, targetPlan.title);
    const topologyRole = this.topologyRole(plan, edgeId);
    const factIds = [...new Set([...sourcePlan.factIds, ...targetPlan.factIds])];
    const relevantFacts = context.facts.filter((fact) => factIds.includes(fact.id)).map((fact) => ({ id: fact.id, kind: fact.kind, value: fact.value, entityId: fact.entityId }));
    const clarifications = [...new Set([...sourcePlan.blockedByClarificationIds, ...targetPlan.blockedByClarificationIds])];
    const allowedEdgeTypes = Object.keys(edgeTypeSymbols) as StageDEdgeType[];
    return stageDEdgeGroundingInputSchema.parse({
      contractVersion: stageDGroundingContractVersion, edgeId, sourceNodeId: edge.source, targetNodeId: edge.target,
      sourceSemanticRole: source.semanticRole, targetSemanticRole: target.semanticRole,
      sourceCanonicalFunction: source.canonicalFunctionId, targetCanonicalFunction: target.canonicalFunctionId,
      sourceGrounding: source, targetGrounding: target, topologyRole, topologyLabel: edge.label,
      topologyCondition: edge.condition, topologyPurpose: edge.businessReason,
      relevantFacts, evidenceReferences: edge.evidenceIds, patternReferences: [...new Set([...sourcePlan.patternIds, ...targetPlan.patternIds])],
      sourceCardinality: source.outputCardinality, targetCardinality: target.inputCardinality,
      blockingClarificationReferences: clarifications, platform: context.platform,
      capabilityLimitations: [...source.mappingLimitations, ...target.mappingLimitations],
      allowedEdgeTypes, symbolTableSnapshotHash: contentHash(edgeTypeSymbols),
      patternVersion: 'k3.1', capabilityVersion: KNOWLEDGE_CATALOG_VERSION,
    });
  }

  private topologyRole(plan: StructuredWorkflowPlan, edgeId: string): string {
    const binary = plan.binaryConditions.find((item) => item.trueEdgeId === edgeId || item.falseEdgeId === edgeId);
    if (binary) return binary.trueEdgeId === edgeId ? 'true' : 'false';
    const route = plan.routers.flatMap((router) => router.routes).find((item) => item.edgeId === edgeId);
    if (route) return /unknown|default|fallback|otherwise/i.test(route.label) ? 'fallback-route' : 'route';
    const loop = plan.loops.find((item) => item.entryEdgeId === edgeId || item.exitEdgeId === edgeId);
    if (loop) return loop.entryEdgeId === edgeId ? 'loop-entry' : 'loop-exit';
    const retry = plan.retries.find((item) => item.failureEdgeId === edgeId);
    if (retry) return 'failure';
    const edge = plan.edges.find((item) => item.id === edgeId)!;
    if (plan.merges.some((item) => item.nodeId === edge.target)) return 'merge-input';
    if (plan.merges.some((item) => item.continuationEdgeId === edgeId)) return 'merge-continuation';
    if (edge.label === 'ITEM') return 'current-item';
    if (edge.label === 'NEXT ITEM') return 'loop-back';
    if (edge.label === 'DONE') return 'completion';
    if (/retry/i.test(edge.label)) return 'retry';
    if (/exhaust/i.test(edge.label)) return 'retry-exhausted';
    if (/loop.?back/i.test(edge.label)) return 'loop-back';
    return 'sequence';
  }

  private validateEdge(plan: StructuredWorkflowPlan, context: PlannerContext, edge: GroundedEdge, input: StageDEdgeGroundingInput): Array<{ code: string; edgeId: string | null; message: string }> {
    const original = plan.edges.find((item) => item.id === edge.edgeId);
    const issues: Array<{ code: string; edgeId: string | null; message: string }> = [];
    if (!original || original.source !== edge.sourceNodeId || original.target !== edge.targetNodeId) issues.push({ code: 'STAGE_D_INVALID_REFERENCE', edgeId: edge.edgeId, message: 'Edge endpoints differ from P4.' });
    if (edge.groundingMethod !== 'unresolved' && !input.allowedEdgeTypes.includes(edge.edgeType)) issues.push({ code: 'STAGE_D_EDGE_TYPE_OUTSIDE_VOCABULARY', edgeId: edge.edgeId, message: 'Edge type is outside the bounded table.' });
    if (edge.edgeType === 'true' && edge.sourceHandle !== 'true') issues.push({ code: 'STAGE_D_TRUE_HANDLE', edgeId: edge.edgeId, message: 'TRUE edge must use the true handle.' });
    if (edge.edgeType === 'false' && edge.sourceHandle !== 'false') issues.push({ code: 'STAGE_D_FALSE_HANDLE', edgeId: edge.edgeId, message: 'FALSE edge must use the false handle.' });
    if (edge.groundingMethod !== 'unresolved' && !edge.evidenceReferences.every((id) => context.evidence.some((item) => item.id === id))) issues.push({ code: 'STAGE_D_INVALID_EVIDENCE', edgeId: edge.edgeId, message: 'Edge references unknown evidence.' });
    if (!edge.clarificationReferences.every((id) => context.clarifications.some((item) => item.id === id))) issues.push({ code: 'STAGE_D_INVALID_CLARIFICATION', edgeId: edge.edgeId, message: 'Edge references unknown clarification.' });
    if (!this.cardinalityCompatible(edge)) issues.push({ code: 'STAGE_D_CARDINALITY_MISMATCH', edgeId: edge.edgeId, message: edge.cardinalityRelationship });
    return issues;
  }

  private validateGraph(plan: StructuredWorkflowPlan, edges: GroundedEdge[]): Array<{ code: string; edgeId: string | null; message: string }> {
    const issues: Array<{ code: string; edgeId: string | null; message: string }> = [];
    for (const binary of plan.binaryConditions) {
      const yes = edges.find((edge) => edge.edgeId === binary.trueEdgeId);
      const no = edges.find((edge) => edge.edgeId === binary.falseEdgeId);
      if (yes && no && yes.sourceHandle === no.sourceHandle) issues.push({ code: 'STAGE_D_BRANCH_HANDLES_NOT_DISTINCT', edgeId: binary.trueEdgeId, message: 'TRUE and FALSE handles must differ.' });
    }
    for (const router of plan.routers) {
      const grounded = router.routes.map((route) => edges.find((edge) => edge.edgeId === route.edgeId)).filter(Boolean) as GroundedEdge[];
      if (new Set(grounded.map((edge) => edge.displayLabel.toLowerCase())).size !== grounded.length) issues.push({ code: 'STAGE_D_DUPLICATE_ROUTE_LABEL', edgeId: null, message: 'Router labels must be unique.' });
      if (new Set(router.routes.map((route) => route.destination)).size !== router.routes.length) issues.push({ code: 'STAGE_D_DUPLICATE_ROUTE_DESTINATION', edgeId: null, message: 'Router destinations must be distinct.' });
    }
    for (const loop of plan.loops) {
      const entry = plan.edges.find((edge) => edge.id === loop.entryEdgeId);
      const exit = plan.edges.find((edge) => edge.id === loop.exitEdgeId);
      if (!entry || entry.target !== loop.nodeId) issues.push({ code: 'STAGE_D_LOOP_ENTRY_BOUNDARY', edgeId: loop.entryEdgeId, message: 'Loop entry must target the loop boundary.' });
      if (!exit || exit.source !== loop.nodeId || exit.target === loop.bodyEntryNodeId) issues.push({ code: 'STAGE_D_LOOP_EXIT_BOUNDARY', edgeId: loop.exitEdgeId, message: 'Loop exit must leave the loop body.' });
      const loopBacks = edges.filter((edge) => edge.edgeType === 'loop-back' && edge.targetNodeId === loop.nodeId);
      if (!loopBacks.length) issues.push({ code: 'STAGE_D_LOOP_BACK_BOUNDARY', edgeId: null, message: 'Loop requires a loop-back edge to its boundary.' });
    }
    for (const merge of plan.merges) {
      const inputs = edges.filter((edge) => edge.edgeType === 'merge-input' && edge.targetNodeId === merge.nodeId);
      if (new Set(inputs.map((edge) => edge.sourceNodeId)).size < 2) issues.push({ code: 'STAGE_D_MERGE_INPUTS', edgeId: null, message: 'Merge inputs must originate from distinct branches.' });
    }
    for (const edge of edges.filter((item) => item.edgeType === 'item-result')) {
      const target = plan.nodes.find((node) => node.id === edge.targetNodeId);
      if (target?.canonicalFunctionId !== 'aggregator') issues.push({ code: 'STAGE_D_AGGREGATOR_INPUT', edgeId: edge.edgeId, message: 'Item-result edges must target an Aggregator.' });
    }
    for (const retry of plan.retries) {
      const failure = edges.find((edge) => edge.edgeId === retry.failureEdgeId);
      if (!failure || failure.edgeType !== 'failure' || failure.targetNodeId !== retry.nodeId) issues.push({ code: 'STAGE_D_RETRY_FAILURE_BOUNDARY', edgeId: retry.failureEdgeId, message: 'Retry failure edge must enter the Retry boundary.' });
      for (const edge of edges.filter((item) => item.edgeType === 'retry')) {
        if (edge.sourceNodeId !== retry.nodeId || edge.targetNodeId !== retry.targetNodeId) issues.push({ code: 'STAGE_D_RETRY_TARGET', edgeId: edge.edgeId, message: 'Retry edge must return to the failed technical operation.' });
      }
    }
    return issues;
  }

  private cardinalityCompatible(edge: GroundedEdge): boolean {
    if (edge.groundingMethod === 'unresolved' || edge.sourceCardinality === 'unknown' || edge.targetCardinality === 'unknown' || edge.sourceCardinality === 'none') return true;
    if (/next item/i.test(edge.displayLabel)) return edge.targetCardinality === 'collection';
    if (edge.edgeType === 'collection-input') return edge.sourceCardinality === 'collection' && edge.targetCardinality === 'collection';
    if (edge.edgeType === 'current-item') return edge.targetCardinality === 'single';
    if (edge.edgeType === 'item-result') return true;
    if (edge.sourceCardinality === 'collection' && edge.targetCardinality === 'single') return false;
    return true;
  }

  private failedEdge(input: StageDEdgeGroundingInput, reason: string): GroundedEdge {
    return groundedEdgeSchema.parse({
      contractVersion: stageDGroundingContractVersion, edgeId: input.edgeId,
      sourceNodeId: input.sourceNodeId, targetNodeId: input.targetNodeId, edgeType: 'unresolved',
      sourceHandle: 'unresolved', targetHandle: 'input', displayLabel: `Unresolved — ${input.topologyLabel}`,
      conditionSummary: null, businessReason: input.topologyPurpose, dataContractSummary: [],
      sourceCardinality: input.sourceCardinality, targetCardinality: input.targetCardinality,
      cardinalityRelationship: `${input.sourceCardinality} → ${input.targetCardinality}`,
      factReferences: input.relevantFacts.map((fact) => fact.id), evidenceReferences: input.evidenceReferences,
      patternReferences: input.patternReferences, clarificationReferences: input.blockingClarificationReferences,
      capabilityLimitationReferences: input.capabilityLimitations, groundingMethod: 'unresolved',
      groundingProvenance: ['Failure was isolated to this edge.'], validationStatus: 'unresolved',
      unresolvedRequirement: reason, selectedEdgeTypeSymbol: null,
    });
  }

  private placeholder(nodeId: string, canonicalFunctionId: string, purpose: string): GroundedNode {
    return {
      contractVersion: '1.0.0', nodeId, canonicalFunctionId, semanticRole: canonicalFunctionId,
      applicationId: null, operationId: null, applicationLabel: null, operationLabel: null, purpose,
      semanticInputs: [], semanticOutputs: [], inputCardinality: canonicalFunctionId === 'iterator' ? 'collection' : 'single',
      outputCardinality: canonicalFunctionId === 'iterator' ? 'single' : canonicalFunctionId === 'end' ? 'none' : 'unknown',
      capabilityReferences: [], knowledgeReferences: [], platformMappingStatus: 'unresolved',
      mappingLimitations: [], alternatives: [], groundingMethod: 'unresolved', groundingProvenance: ['Stage C result unavailable.'],
      blockingClarificationReferences: [], unresolvedRequirement: 'Stage C result unavailable.',
      selectedApplicationSymbol: null, selectedOperationSymbol: null,
    };
  }

  private topologyHash(plan: StructuredWorkflowPlan): string {
    return contentHash({ entryNodeId: plan.entryNodeId, nodes: plan.nodes.map((node) => ({ id: node.id, canonicalFunctionId: node.canonicalFunctionId })), edges: plan.edges, binaryConditions: plan.binaryConditions, routers: plan.routers, merges: plan.merges, loops: plan.loops, retries: plan.retries });
  }

  private report(
    status: StageDGroundingReport['status'], topologyBefore: string, topologyAfter: string,
    nodesBefore: string, nodesAfter: string, edges: GroundedEdge[],
    issues: Array<{ code: string; edgeId: string | null; message: string }>,
    cache: { hits: number; misses: number }, outcomes: CachedEdge[], retries: number,
  ): StageDGroundingReport {
    const deterministic = outcomes.filter((item) => item.edge.groundingMethod === 'deterministic');
    const modeled = outcomes.filter((item) => item.edge.groundingMethod === 'model-selected');
    const ratio = (invalid: string) => edges.length ? 1 - issues.filter((item) => item.code.includes(invalid)).length / edges.length : 1;
    const clarificationEdges = edges.filter((edge) => edge.clarificationReferences.length);
    return stageDGroundingReportSchema.parse({
      contractVersion: stageDGroundingContractVersion, status, topologyHashBefore: topologyBefore,
      topologyHashAfter: topologyAfter, topologyUnchanged: topologyBefore === topologyAfter,
      stageCNodeHashBefore: nodesBefore, stageCNodeHashAfter: nodesAfter, stageCNodesUnchanged: nodesBefore === nodesAfter,
      edges, unresolvedEdgeIds: edges.filter((edge) => edge.groundingMethod === 'unresolved').map((edge) => edge.edgeId), validationIssues: issues,
      metrics: {
        totalEdges: edges.length, deterministicallyGroundedEdges: edges.filter((edge) => edge.groundingMethod === 'deterministic').length,
        modelGroundedEdges: edges.filter((edge) => edge.groundingMethod === 'model-selected').length,
        unresolvedEdges: edges.filter((edge) => edge.groundingMethod === 'unresolved').length,
        invalidReferences: issues.filter((item) => item.code.includes('REFERENCE')).length,
        genericLabels: edges.filter((edge) => genericLabel(edge.displayLabel)).length,
        branchLabelCorrectness: ratio('HANDLE'), routeCompleteness: ratio('ROUTE'),
        loopBoundaryCorrectness: ratio('LOOP'), mergeInputCorrectness: ratio('MERGE'),
        cardinalityTransitionCorrectness: ratio('CARDINALITY'),
        clarificationPreservation: clarificationEdges.every((edge) => edge.clarificationReferences.length) ? 1 : 0,
        topologyMutations: topologyBefore === topologyAfter ? 0 : 1, stageCMutations: nodesBefore === nodesAfter ? 0 : 1,
        averageDeterministicLatencyMs: deterministic.length ? deterministic.reduce((sum, item) => sum + item.deterministicLatencyMs, 0) / deterministic.length : 0,
        averageModelLatencyMs: modeled.length ? modeled.reduce((sum, item) => sum + item.modelLatencyMs, 0) / modeled.length : 0,
        cacheHits: cache.hits, cacheMisses: cache.misses, retries,
      }, persisted: false,
    });
  }
}

const genericLabel = (label: string): boolean => ['path 1', 'branch a', 'success', 'continue'].includes(label.toLowerCase());
