import { KNOWLEDGE_CATALOG_VERSION } from '@awm/knowledge';
import {
  groundedNodeSchema,
  stageCGroundingContractVersion,
  stageCGroundingReportSchema,
  stageCNodeGroundingInputSchema,
  type GroundedNode,
  type PlannerContext,
  type StageCGroundingReport,
  type StageCNodeGroundingInput,
  type StructuredWorkflowPlan,
} from '@awm/shared';
import { DistributedPlannerOrchestrator, DistributedStageError, type DistributedStageDefinition, type ModelNeutralStageRunner } from '../distributed-planner/distributed-planner-orchestrator.js';
import { contentHash, InMemoryStageCache } from '../distributed-planner/stage-cache.js';
import { buildStageCCandidates, semanticRoleFor, StageCNodeGrounder, type StageCModelSelector } from './stage-c-node-grounder.js';

export interface StageCGroundingOptions {
  enabled: boolean;
  maximumConcurrency: number;
  nodeTimeoutMs: number;
  maximumRetries: number;
  cacheEnabled: boolean;
  maximumOutputCharacters: number;
}

interface CachedGrounding { node: GroundedNode; deterministicLatencyMs: number; modelLatencyMs: number; unsupportedRejected: number }

class GroundingRunner implements ModelNeutralStageRunner {
  public readonly runnerId = 'stage-c.node-grounder';
  public readonly modelId: string | null;
  public constructor(
    modelSelector: StageCModelSelector | null,
    private readonly input: StageCNodeGroundingInput,
    private readonly grounder: StageCNodeGrounder,
    private readonly cache: Map<string, CachedGrounding>,
    private readonly cacheKey: string,
    private readonly cacheEnabled: boolean,
    private readonly capture: Map<string, CachedGrounding>,
    private readonly cacheStats: { hits: number; misses: number },
  ) { this.modelId = modelSelector?.modelId ?? null; }

  public async run(_input: unknown, context: Parameters<ModelNeutralStageRunner['run']>[1]): Promise<unknown> {
    const cached = this.cacheEnabled ? this.cache.get(this.cacheKey) : undefined;
    if (cached) {
      this.cacheStats.hits += 1;
      this.capture.set(this.input.nodeId, structuredClone(cached));
      return cached.node;
    }
    this.cacheStats.misses += 1;
    try {
      const result = await this.grounder.ground(this.input, context.signal);
      const cachedResult = { node: result.node, deterministicLatencyMs: result.latencyMs - result.modelLatencyMs, modelLatencyMs: result.modelLatencyMs, unsupportedRejected: result.unsupportedRejected };
      if (this.cacheEnabled) this.cache.set(this.cacheKey, structuredClone(cachedResult));
      this.capture.set(this.input.nodeId, cachedResult);
      return result.node;
    } catch (error) {
      throw new DistributedStageError('invalid-output', error instanceof Error ? error.message : 'Node grounding failed.', true);
    }
  }
}

export class StageCGroundingService {
  private readonly cache = new Map<string, CachedGrounding>();
  public constructor(private readonly options: StageCGroundingOptions, private readonly modelSelector: StageCModelSelector | null = null) {}

  public async ground(plan: StructuredWorkflowPlan, context: PlannerContext, signal?: AbortSignal): Promise<StageCGroundingReport> {
    const topologyHashBefore = this.topologyHash(plan);
    if (!this.options.enabled) return this.report('completed', topologyHashBefore, topologyHashBefore, [], [], { hits: 0, misses: 0 }, [], false);
    const captured = new Map<string, CachedGrounding>();
    const inputs = plan.nodes.map((node) => this.inputFor(plan, context, node.id));
    const cacheStats = { hits: 0, misses: 0 };
    const orchestrator = new DistributedPlannerOrchestrator({
      totalTimeoutMs: Math.max(this.options.nodeTimeoutMs, this.options.nodeTimeoutMs * Math.ceil(inputs.length / this.options.maximumConcurrency)),
      maximumConcurrency: this.options.maximumConcurrency,
      cacheEnabled: false,
    }, new InMemoryStageCache());
    for (const input of inputs) {
      const cacheKey = contentHash({
        nodePurposeHash: contentHash(input.purpose), semanticRole: input.semanticRole,
        canonicalFunction: input.canonicalFunctionId, factHash: contentHash(input.relevantFacts),
        evidenceHash: contentHash(input.evidenceReferences), platform: input.platform,
        applicationPackVersion: input.applicationPackVersion, capabilityCatalogVersion: input.capabilityCatalogVersion,
        symbolTableSnapshotHash: input.symbolTableSnapshotHash, groundingContractVersion: input.contractVersion,
        modelIdentity: this.modelSelector?.modelId ?? null,
      });
      const runner = new GroundingRunner(this.modelSelector, input, new StageCNodeGrounder(this.modelSelector), this.cache, cacheKey, this.options.cacheEnabled, captured, cacheStats);
      const definition: DistributedStageDefinition = {
        contractVersion: '2.0.0', instanceId: `stage-c-${input.nodeId}`, stageId: 'node-grounding',
        version: '1.0.0', inputContractVersion: stageCGroundingContractVersion, enabled: true, dependencies: [],
        timeoutMs: this.options.nodeTimeoutMs,
        retryPolicy: { maximumRetries: this.options.maximumRetries, retryableCategories: ['invalid-output', 'malformed-model-output'] },
        cachePolicy: { enabled: false }, inputSchema: stageCNodeGroundingInputSchema, outputSchema: groundedNodeSchema,
        buildInput: () => input, runner,
      };
      orchestrator.register(definition);
    }
    const orchestration = await orchestrator.run({
      rawScope: context.objective, normalizedScopeHash: contentHash(context.objective), platform: context.platform,
      detectorVersion: context.version, catalogVersion: KNOWLEDGE_CATALOG_VERSION,
    }, { ...(signal ? { signal } : {}) });

    const nodes = inputs.map((input) => captured.get(input.nodeId)?.node ?? this.failedNode(input, orchestration.stages.find((stage) => stage.stageInstanceId === `stage-c-${input.nodeId}`)?.failure?.cause ?? 'Grounding task did not complete.'));
    const validationIssues = nodes.flatMap((node) => this.validateNode(node, inputs.find((input) => input.nodeId === node.nodeId)!));
    const topologyHashAfter = this.topologyHash(plan);
    if (topologyHashBefore !== topologyHashAfter) validationIssues.push({ code: 'STAGE_C_TOPOLOGY_MUTATION', nodeId: null, message: 'Stage C changed the P4 topology snapshot.' });
    const retries = orchestration.stages.reduce((sum, stage) => sum + Math.max(0, stage.attempts - 1), 0);
    const status = signal?.aborted ? 'cancelled' : validationIssues.length ? 'failed' : nodes.some((node) => node.groundingMethod === 'unresolved') ? 'partial' : 'completed';
    return this.report(status, topologyHashBefore, topologyHashAfter, nodes, validationIssues, cacheStats, [...captured.values()], retries > 0, retries);
  }

  private inputFor(plan: StructuredWorkflowPlan, context: PlannerContext, nodeId: string): StageCNodeGroundingInput {
    const node = plan.nodes.find((item) => item.id === nodeId)!;
    const incoming = plan.edges.filter((edge) => edge.target === nodeId);
    const iteratorItem = incoming.some((edge) => edge.label === 'ITEM' && plan.nodes.find((item) => item.id === edge.source)?.canonicalFunctionId === 'iterator');
    const inputCardinality = node.canonicalFunctionId === 'trigger' ? 'none' : node.canonicalFunctionId === 'end' ? 'unknown' : node.canonicalFunctionId === 'iterator' ? 'collection' : iteratorItem ? 'single' : node.canonicalFunctionId === 'aggregator' ? 'collection' : 'single';
    const aggregatedResultFeedsAction = node.canonicalFunctionId === 'aggregator'
      && plan.edges.some((edge) => edge.source === nodeId && edge.label === 'USE AGGREGATED RESULT');
    const expectedOutputCardinality = node.canonicalFunctionId === 'end' ? 'none' : node.canonicalFunctionId === 'aggregator' ? (aggregatedResultFeedsAction ? 'single' : 'collection') : node.canonicalFunctionId === 'data-retrieval' ? 'unknown' : 'single';
    const relevantFacts = context.facts.filter((fact) => node.factIds.includes(fact.id)).map((fact) => ({ id: fact.id, kind: fact.kind, value: fact.value, entityId: fact.entityId }));
    const candidates = buildStageCCandidates(node.canonicalFunctionId, context.platform);
    return stageCNodeGroundingInputSchema.parse({
      contractVersion: stageCGroundingContractVersion, nodeId, canonicalFunctionId: node.canonicalFunctionId,
      semanticRole: semanticRoleFor(node.canonicalFunctionId), purpose: node.title, platform: context.platform,
      relevantFacts, evidenceReferences: [...new Set(relevantFacts.flatMap((fact) => context.facts.find((item) => item.id === fact.id)?.evidenceIds ?? []))],
      inputCardinality, expectedOutputCardinality, patternReferences: node.patternIds,
      candidates, blockingClarificationReferences: node.blockedByClarificationIds,
      symbolTableSnapshotHash: contentHash(candidates.map((item) => ({ a: item.applicationSymbol, o: item.operationSymbol, aid: item.applicationId, oid: item.operationId }))),
      applicationPackVersion: KNOWLEDGE_CATALOG_VERSION, capabilityCatalogVersion: KNOWLEDGE_CATALOG_VERSION,
    });
  }

  private validateNode(node: GroundedNode, input: StageCNodeGroundingInput): Array<{ code: string; nodeId: string | null; message: string }> {
    if (node.groundingMethod === 'unresolved') return [];
    const candidate = input.candidates.find((item) => item.applicationId === node.applicationId && item.operationId === node.operationId);
    if (!candidate) return [{ code: 'STAGE_C_INVALID_REFERENCE', nodeId: node.nodeId, message: 'Grounding references an operation outside the bounded node table.' }];
    const issues: Array<{ code: string; nodeId: string | null; message: string }> = [];
    if (candidate.canonicalFunctionId !== input.canonicalFunctionId) issues.push({ code: 'STAGE_C_ROLE_OPERATION_MISMATCH', nodeId: node.nodeId, message: 'Operation does not implement the node canonical function.' });
    if (!candidate.acceptedInputCardinality.includes(input.inputCardinality === 'none' ? 'single' : input.inputCardinality as 'single' | 'collection')) issues.push({ code: 'STAGE_C_INPUT_CARDINALITY_MISMATCH', nodeId: node.nodeId, message: `Operation does not accept ${input.inputCardinality} input.` });
    if (candidate.outputCardinality !== input.expectedOutputCardinality && input.expectedOutputCardinality !== 'unknown') issues.push({ code: 'STAGE_C_OUTPUT_CARDINALITY_MISMATCH', nodeId: node.nodeId, message: `Operation produces ${candidate.outputCardinality}, not ${input.expectedOutputCardinality}.` });
    if (candidate.platformStatus === 'unsupported') issues.push({ code: 'STAGE_C_UNSUPPORTED_OPERATION', nodeId: node.nodeId, message: 'Unsupported platform operation was accepted.' });
    return issues;
  }

  private failedNode(input: StageCNodeGroundingInput, reason: string): GroundedNode {
    return groundedNodeSchema.parse({
      contractVersion: stageCGroundingContractVersion, nodeId: input.nodeId, canonicalFunctionId: input.canonicalFunctionId,
      semanticRole: input.semanticRole, applicationId: null, operationId: null, applicationLabel: null, operationLabel: null,
      purpose: input.purpose, semanticInputs: [], semanticOutputs: [], inputCardinality: input.inputCardinality,
      outputCardinality: input.expectedOutputCardinality, capabilityReferences: [], knowledgeReferences: [],
      platformMappingStatus: 'unresolved', mappingLimitations: [], alternatives: [],
      groundingMethod: 'unresolved', groundingProvenance: ['Grounding failure was isolated to this node.'],
      blockingClarificationReferences: input.blockingClarificationReferences, unresolvedRequirement: reason,
      selectedApplicationSymbol: null, selectedOperationSymbol: null,
    });
  }

  private topologyHash(plan: StructuredWorkflowPlan): string {
    return contentHash({
      entryNodeId: plan.entryNodeId,
      nodes: plan.nodes.map((node) => ({ id: node.id, canonicalFunctionId: node.canonicalFunctionId })),
      edges: plan.edges, binaryConditions: plan.binaryConditions, routers: plan.routers,
      merges: plan.merges, loops: plan.loops, retries: plan.retries,
    });
  }

  private report(
    status: StageCGroundingReport['status'], before: string, after: string, nodes: GroundedNode[],
    validationIssues: Array<{ code: string; nodeId: string | null; message: string }>,
    cacheStats: { hits: number; misses: number }, outcomes: CachedGrounding[], hadRetries: boolean, retries = 0,
  ): StageCGroundingReport {
    const deterministic = outcomes.filter((item) => item.node.groundingMethod === 'deterministic');
    const modeled = outcomes.filter((item) => item.node.groundingMethod === 'model-selected');
    const clarificationTotal = nodes.reduce((sum, node) => sum + node.blockingClarificationReferences.length, 0);
    const clarificationPreserved = nodes.reduce((sum, node) => sum + node.blockingClarificationReferences.length, 0);
    return stageCGroundingReportSchema.parse({
      contractVersion: stageCGroundingContractVersion, status, topologyHashBefore: before, topologyHashAfter: after,
      topologyUnchanged: before === after, nodes, unresolvedNodeIds: nodes.filter((node) => node.groundingMethod === 'unresolved').map((node) => node.nodeId),
      validationIssues,
      metrics: {
        totalNodes: nodes.length, deterministicallyGroundedNodes: nodes.filter((node) => node.groundingMethod === 'deterministic').length,
        modelGroundedNodes: nodes.filter((node) => node.groundingMethod === 'model-selected').length,
        unresolvedNodes: nodes.filter((node) => node.groundingMethod === 'unresolved').length,
        invalidReferences: validationIssues.filter((item) => item.code === 'STAGE_C_INVALID_REFERENCE').length,
        unsupportedOperationsRejected: outcomes.reduce((sum, item) => sum + item.unsupportedRejected, 0),
        roleOperationMismatches: validationIssues.filter((item) => item.code === 'STAGE_C_ROLE_OPERATION_MISMATCH').length,
        cardinalityMismatches: validationIssues.filter((item) => item.code.includes('CARDINALITY_MISMATCH')).length,
        topologyMutations: before === after ? 0 : 1,
        averageDeterministicLatencyMs: deterministic.length ? deterministic.reduce((sum, item) => sum + item.deterministicLatencyMs, 0) / deterministic.length : 0,
        averageModelLatencyMs: modeled.length ? modeled.reduce((sum, item) => sum + item.modelLatencyMs, 0) / modeled.length : 0,
        cacheHits: cacheStats.hits, cacheMisses: cacheStats.misses, retries: hadRetries ? retries : 0,
        clarificationPreservationRate: clarificationTotal ? clarificationPreserved / clarificationTotal : 1,
      },
      persisted: false,
    });
  }
}
