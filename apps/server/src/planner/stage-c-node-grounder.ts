import { applicationPacks, KNOWLEDGE_CATALOG_VERSION, type OperationDefinition } from '@awm/knowledge';
import {
  groundedNodeSchema,
  stageCGroundingContractVersion,
  type GroundedNode,
  type StageCNodeGroundingInput,
  type StageCOperationCandidate,
} from '@awm/shared';

export interface StageCModelSelection {
  applicationSymbol: number;
  operationSymbol: number;
  reason: string;
}

export interface StageCModelSelector {
  readonly modelId: string;
  select(input: StageCNodeGroundingInput, signal: AbortSignal): Promise<StageCModelSelection>;
}

export interface StageCGroundingOutcome {
  node: GroundedNode;
  latencyMs: number;
  modelLatencyMs: number;
  unsupportedRejected: number;
}

const internalFunctions = new Set([
  'binary-condition', 'multi-route-decision', 'iterator', 'loop', 'merge', 'aggregator',
  'delay', 'human-approval', 'retry', 'error-handler', 'manual-review', 'end',
  'validation', 'filter', 'data-transformation', 'logging',
]);

const unsupportedApplicationTerms = ['sms', 'shopify', 'outlook', 'facebook lead ads', 'hubspot'];

const semanticRoleFor = (canonicalFunctionId: string): string => ({
  trigger: 'workflow-trigger',
  'data-retrieval': 'data-retrieval',
  'data-transformation': 'data-transformation',
  validation: 'validation-gate',
  filter: 'validation-gate',
  'binary-condition': 'binary-decision',
  'multi-route-decision': 'multi-route-decision',
  iterator: 'collection-iterator',
  loop: 'business-loop',
  retry: 'technical-retry',
  merge: 'branch-merge',
  aggregator: 'item-aggregator',
  delay: 'delay-boundary',
  notification: 'notification',
  logging: 'logging',
  'human-approval': 'manual-review',
  'manual-review': 'manual-review',
  end: 'successful-end',
}[canonicalFunctionId] ?? 'data-transformation');

export function buildStageCCandidates(canonicalFunctionId: string, platform: StageCNodeGroundingInput['platform']): StageCOperationCandidate[] {
  let applicationSymbol = 0;
  let operationSymbol = 100;
  return applicationPacks.flatMap((pack) => {
    applicationSymbol += 1;
    return pack.operations.filter((operation) => operation.canonicalFunctionId === canonicalFunctionId).map((operation) => {
      operationSymbol += 1;
      const mapping = operation.knownPlatformMappings.find((item) => item.platform === platform);
      const status = mapping?.support === 'unknown' ? 'limited' : mapping?.support ?? 'unsupported';
      return {
        applicationSymbol,
        operationSymbol,
        applicationId: pack.applicationId,
        operationId: operation.operationId,
        applicationLabel: pack.name,
        operationLabel: operation.title,
        canonicalFunctionId: operation.canonicalFunctionId,
        acceptedInputCardinality: operation.acceptedInputCardinality,
        outputCardinality: operation.producedOutputCardinality,
        platformStatus: status,
        limitations: [...operation.limitations, ...(mapping?.limitation ? [mapping.limitation] : [])],
        alternatives: [...operation.alternatives, ...(mapping?.alternative ? [mapping.alternative] : [])],
        capabilityReferences: mapping?.capabilityId ? [mapping.capabilityId] : [],
      } satisfies StageCOperationCandidate;
    });
  });
}

export class StageCNodeGrounder {
  public constructor(private readonly modelSelector: StageCModelSelector | null = null) {}

  public async ground(input: StageCNodeGroundingInput, signal: AbortSignal): Promise<StageCGroundingOutcome> {
    const started = performance.now();
    const supported = input.candidates.filter((candidate) => candidate.platformStatus !== 'unsupported');
    const unsupportedRejected = input.candidates.length - supported.length;
    if (internalFunctions.has(input.canonicalFunctionId) && !supported.length) {
      return { node: this.unresolved(input, `The ${input.semanticRole} role is an internal workflow-control capability and has no application operation.`), latencyMs: performance.now() - started, modelLatencyMs: 0, unsupportedRejected };
    }
    if (!supported.length) {
      return { node: this.unresolved(input, `No supported ${input.canonicalFunctionId} operation exists for ${input.platform}.`, input.candidates), latencyMs: performance.now() - started, modelLatencyMs: 0, unsupportedRejected };
    }
    const requiredInput = input.inputCardinality === 'none' ? 'single' : input.inputCardinality;
    const cardinalityCompatible = supported.filter((candidate) =>
      candidate.acceptedInputCardinality.includes(requiredInput as 'single' | 'collection')
      && (input.expectedOutputCardinality === 'unknown' || candidate.outputCardinality === input.expectedOutputCardinality),
    );
    if (!cardinalityCompatible.length) {
      return { node: this.unresolved(input, `No supported operation matches ${input.inputCardinality} input and ${input.expectedOutputCardinality} output cardinality.`, supported), latencyMs: performance.now() - started, modelLatencyMs: 0, unsupportedRejected };
    }
    const purpose = input.purpose.toLowerCase();
    const namedUnsupportedApplication = unsupportedApplicationTerms.find((term) => purpose.includes(term));
    if (namedUnsupportedApplication) {
      return {
        node: this.unresolved(
          input,
          `The request explicitly names ${namedUnsupportedApplication}, but no supported ${namedUnsupportedApplication} operation exists in the current catalog.`,
          cardinalityCompatible,
        ),
        latencyMs: performance.now() - started,
        modelLatencyMs: 0,
        unsupportedRejected,
      };
    }
    const scored = cardinalityCompatible.map((candidate) => ({ candidate, score: this.score(input, candidate) })).sort((a, b) => b.score - a.score || a.candidate.operationSymbol - b.candidate.operationSymbol);
    const best = scored[0]!;
    const unique = best.score >= 5 && (scored.length === 1 || best.score > scored[1]!.score);
    if (unique) {
      return { node: this.resolved(input, best.candidate, 'deterministic', [`Unique catalog match scored ${best.score}.`, 'Matched explicit application, operation language, canonical function, platform support, and cardinality.']), latencyMs: performance.now() - started, modelLatencyMs: 0, unsupportedRejected };
    }
    if (!this.modelSelector) {
      return { node: this.unresolved(input, 'Multiple supported operations remain and no optional model selector is configured.', scored.slice(0, 4).map((item) => item.candidate)), latencyMs: performance.now() - started, modelLatencyMs: 0, unsupportedRejected };
    }
    const modelStarted = performance.now();
    const selection = await this.modelSelector.select({ ...input, candidates: scored.slice(0, 8).map((item) => item.candidate) }, signal);
    const modelLatencyMs = performance.now() - modelStarted;
    const selected = cardinalityCompatible.find((candidate) => candidate.applicationSymbol === selection.applicationSymbol && candidate.operationSymbol === selection.operationSymbol);
    if (!selected) throw new Error(`Model selected unknown or wrong-namespace operation symbol ${selection.operationSymbol}.`);
    return { node: this.resolved(input, selected, 'model-selected', [`Optional model selected a bounded catalog candidate.`, selection.reason, `Model: ${this.modelSelector.modelId}.`]), latencyMs: performance.now() - started, modelLatencyMs, unsupportedRejected };
  }

  private score(input: StageCNodeGroundingInput, candidate: StageCOperationCandidate): number {
    const purpose = input.purpose.toLowerCase();
    const facts = input.relevantFacts.map((fact) => fact.value).join(' ').toLowerCase();
    const text = `${purpose} ${facts}`;
    let score = 1;
    const applicationTerms = [candidate.applicationLabel.toLowerCase(), candidate.applicationId.replaceAll('-', ' ')];
    if (applicationTerms.some((term) => purpose.includes(term))) score += 20;
    else if (applicationTerms.some((term) => facts.includes(term))) score += 4;
    const meaningful = candidate.operationLabel.toLowerCase().split(/\s+/).filter((word) => word.length > 2 && !['the', 'with', 'into'].includes(word));
    score += meaningful.filter((word) => purpose.includes(word)).length * 4;
    score += meaningful.filter((word) => !purpose.includes(word) && facts.includes(word)).length;
    const phrases: Array<[RegExp, string, string]> = [
      [/task.*(?:ready|section|moved)/, 'asana', 'task-moved-to-section'],
      [/(?:retrieve|get).*task/, 'asana', 'get-task-details'],
      [/(?:find|search).*subtask/, 'asana', 'find-subtask'],
      [/create.*subtask/, 'asana', 'create-subtask'],
      [/update.*subtask/, 'asana', 'update-subtask'],
      [/update.*(?:task|status)/, 'asana', 'update-task'],
      [/(?:find|search).*folder/, 'google-drive', 'find-folder'],
      [/create.*folder/, 'google-drive', 'create-folder'],
      [/upload.*(?:file|attachment)/, 'google-drive', 'upload-file'],
      [/retrieve.*(?:rows|collection)/, 'google-sheets', 'list-rows'],
      [/(?:add|append|log).*(?:row|sheet|entry)/, 'google-sheets', 'add-row'],
      [/(?:send|follow.?up|welcome|recommendation).*email/, 'gmail', 'send-email'],
      [/(?:receive|new).*email/, 'gmail', 'new-email'],
      [/(?:search|retrieve).*(?:reply|email|message)/, 'gmail', 'search-email'],
      [/(?:notify|send).*(?:slack|channel)/, 'slack', 'send-channel-message'],
      [/(?:find|search).*(?:existing|matching).*(?:record|contact|lead|customer)/, 'generic-crm', 'find-record'],
      [/(?:find|retrieve).*lead/, 'generic-crm', 'find-record'],
    ];
    if (phrases.some(([pattern, app, operation]) => pattern.test(purpose) && candidate.applicationId === app && candidate.operationId === operation)) score += 30;
    else if (phrases.some(([pattern, app, operation]) => pattern.test(text) && candidate.applicationId === app && candidate.operationId === operation)) score += 10;
    if (candidate.acceptedInputCardinality.includes(input.inputCardinality === 'none' ? 'single' : input.inputCardinality as 'single' | 'collection')) score += 3;
    if (candidate.outputCardinality === input.expectedOutputCardinality || input.expectedOutputCardinality === 'unknown') score += 2;
    if (candidate.platformStatus === 'native') score += 2;
    return score;
  }

  private resolved(input: StageCNodeGroundingInput, candidate: StageCOperationCandidate, method: 'deterministic' | 'model-selected', provenance: string[]): GroundedNode {
    const operation = this.operation(candidate);
    return groundedNodeSchema.parse({
      contractVersion: stageCGroundingContractVersion,
      nodeId: input.nodeId, canonicalFunctionId: input.canonicalFunctionId, semanticRole: input.semanticRole,
      applicationId: candidate.applicationId, operationId: candidate.operationId,
      applicationLabel: candidate.applicationLabel, operationLabel: candidate.operationLabel,
      purpose: input.purpose, semanticInputs: operation.requiredInputs.map((field) => field.key),
      semanticOutputs: operation.outputs.map((field) => field.key), inputCardinality: input.inputCardinality,
      outputCardinality: candidate.outputCardinality, capabilityReferences: candidate.capabilityReferences,
      knowledgeReferences: [`${candidate.applicationId}.${candidate.operationId}`],
      platformMappingStatus: candidate.platformStatus, mappingLimitations: candidate.limitations,
      alternatives: candidate.alternatives, groundingMethod: method, groundingProvenance: provenance,
      blockingClarificationReferences: input.blockingClarificationReferences,
      unresolvedRequirement: input.blockingClarificationReferences.length ? 'Operation selected, but business configuration remains blocked by clarification.' : null,
      selectedApplicationSymbol: candidate.applicationSymbol, selectedOperationSymbol: candidate.operationSymbol,
    });
  }

  private unresolved(input: StageCNodeGroundingInput, reason: string, alternatives: StageCOperationCandidate[] = []): GroundedNode {
    return groundedNodeSchema.parse({
      contractVersion: stageCGroundingContractVersion,
      nodeId: input.nodeId, canonicalFunctionId: input.canonicalFunctionId, semanticRole: input.semanticRole,
      applicationId: null, operationId: null, applicationLabel: null, operationLabel: null,
      purpose: input.purpose, semanticInputs: [], semanticOutputs: [],
      inputCardinality: input.inputCardinality, outputCardinality: input.expectedOutputCardinality,
      capabilityReferences: [], knowledgeReferences: [], platformMappingStatus: 'unresolved',
      mappingLimitations: alternatives.flatMap((item) => item.limitations),
      alternatives: alternatives.map((item) => `${item.applicationLabel}: ${item.operationLabel}`),
      groundingMethod: 'unresolved', groundingProvenance: ['No unsupported or ambiguous operation was accepted.'],
      blockingClarificationReferences: input.blockingClarificationReferences,
      unresolvedRequirement: reason, selectedApplicationSymbol: null, selectedOperationSymbol: null,
    });
  }

  private operation(candidate: StageCOperationCandidate): OperationDefinition {
    const operation = applicationPacks.find((pack) => pack.applicationId === candidate.applicationId)?.operations.find((item) => item.operationId === candidate.operationId);
    if (!operation) throw new Error(`Catalog operation ${candidate.applicationId}.${candidate.operationId} disappeared during grounding.`);
    return operation;
  }
}

export const stageCCatalogVersion = KNOWLEDGE_CATALOG_VERSION;
export { semanticRoleFor };
