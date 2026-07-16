import { z } from 'zod';
import { distributedPlannerPlatformSchema } from './distributed-planner.js';

export const stageCGroundingContractVersion = '1.0.0' as const;
const cardinality = z.enum(['none', 'single', 'collection', 'unknown']);

export const stageCOperationCandidateSchema = z.object({
  applicationSymbol: z.number().int().positive(),
  operationSymbol: z.number().int().positive(),
  applicationId: z.string().min(1),
  operationId: z.string().min(1),
  applicationLabel: z.string().min(1),
  operationLabel: z.string().min(1),
  canonicalFunctionId: z.string().min(1),
  acceptedInputCardinality: z.array(cardinality).min(1),
  outputCardinality: cardinality,
  platformStatus: z.enum(['native', 'workaround', 'limited', 'unsupported']),
  limitations: z.array(z.string()),
  alternatives: z.array(z.string()),
  capabilityReferences: z.array(z.string()),
}).strict();

export const stageCNodeGroundingInputSchema = z.object({
  contractVersion: z.literal(stageCGroundingContractVersion),
  nodeId: z.string().min(1),
  canonicalFunctionId: z.string().min(1),
  semanticRole: z.string().min(1),
  purpose: z.string().min(1),
  platform: distributedPlannerPlatformSchema,
  relevantFacts: z.array(z.object({ id: z.string().min(1), kind: z.string().min(1), value: z.string().min(1), entityId: z.string().nullable() }).strict()),
  evidenceReferences: z.array(z.string().min(1)),
  inputCardinality: cardinality,
  expectedOutputCardinality: cardinality,
  patternReferences: z.array(z.string().min(1)),
  candidates: z.array(stageCOperationCandidateSchema),
  blockingClarificationReferences: z.array(z.string().min(1)),
  symbolTableSnapshotHash: z.string().min(1),
  applicationPackVersion: z.string().min(1),
  capabilityCatalogVersion: z.string().min(1),
}).strict();

export const groundedNodeSchema = z.object({
  contractVersion: z.literal(stageCGroundingContractVersion),
  nodeId: z.string().min(1),
  canonicalFunctionId: z.string().min(1),
  semanticRole: z.string().min(1),
  applicationId: z.string().nullable(),
  operationId: z.string().nullable(),
  applicationLabel: z.string().nullable(),
  operationLabel: z.string().nullable(),
  purpose: z.string().min(1),
  semanticInputs: z.array(z.string()),
  semanticOutputs: z.array(z.string()),
  inputCardinality: cardinality,
  outputCardinality: cardinality,
  capabilityReferences: z.array(z.string()),
  knowledgeReferences: z.array(z.string()),
  platformMappingStatus: z.enum(['native', 'workaround', 'limited', 'unsupported', 'unresolved']),
  mappingLimitations: z.array(z.string()),
  alternatives: z.array(z.string()),
  groundingMethod: z.enum(['deterministic', 'model-selected', 'unresolved']),
  groundingProvenance: z.array(z.string().min(1)),
  blockingClarificationReferences: z.array(z.string().min(1)),
  unresolvedRequirement: z.string().nullable(),
  selectedApplicationSymbol: z.number().int().positive().nullable(),
  selectedOperationSymbol: z.number().int().positive().nullable(),
}).strict();

export const stageCGroundingReportSchema = z.object({
  contractVersion: z.literal(stageCGroundingContractVersion),
  status: z.enum(['completed', 'partial', 'failed', 'cancelled']),
  topologyHashBefore: z.string().min(1),
  topologyHashAfter: z.string().min(1),
  topologyUnchanged: z.boolean(),
  nodes: z.array(groundedNodeSchema),
  unresolvedNodeIds: z.array(z.string().min(1)),
  validationIssues: z.array(z.object({ code: z.string().min(1), nodeId: z.string().nullable(), message: z.string().min(1) }).strict()),
  metrics: z.object({
    totalNodes: z.number().int().nonnegative(),
    deterministicallyGroundedNodes: z.number().int().nonnegative(),
    modelGroundedNodes: z.number().int().nonnegative(),
    unresolvedNodes: z.number().int().nonnegative(),
    invalidReferences: z.number().int().nonnegative(),
    unsupportedOperationsRejected: z.number().int().nonnegative(),
    roleOperationMismatches: z.number().int().nonnegative(),
    cardinalityMismatches: z.number().int().nonnegative(),
    topologyMutations: z.number().int().nonnegative(),
    averageDeterministicLatencyMs: z.number().nonnegative(),
    averageModelLatencyMs: z.number().nonnegative(),
    cacheHits: z.number().int().nonnegative(),
    cacheMisses: z.number().int().nonnegative(),
    retries: z.number().int().nonnegative(),
    clarificationPreservationRate: z.number().min(0).max(1),
  }).strict(),
  persisted: z.literal(false),
}).strict();

export type StageCOperationCandidate = z.infer<typeof stageCOperationCandidateSchema>;
export type StageCNodeGroundingInput = z.infer<typeof stageCNodeGroundingInputSchema>;
export type GroundedNode = z.infer<typeof groundedNodeSchema>;
export type StageCGroundingReport = z.infer<typeof stageCGroundingReportSchema>;
