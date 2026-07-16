import { z } from 'zod';
import { groundedNodeSchema } from './stage-c-grounding.js';
import { distributedPlannerPlatformSchema } from './distributed-planner.js';

export const stageDGroundingContractVersion = '1.0.0' as const;
export const stageDEdgeTypeSchema = z.enum([
  'sequence', 'true', 'false', 'route', 'fallback-route', 'collection-input',
  'current-item', 'next-item', 'completion', 'loop-entry', 'loop-continue',
  'loop-back', 'loop-exit', 'merge-input', 'merge-continuation',
  'item-result', 'aggregated-result', 'failure', 'retry', 'retry-exhausted',
  'delayed-continuation', 'approval-approved', 'approval-rejected', 'unresolved',
]);
const cardinality = z.enum(['none', 'single', 'collection', 'unknown']);

export const stageDEdgeGroundingInputSchema = z.object({
  contractVersion: z.literal(stageDGroundingContractVersion),
  edgeId: z.string().min(1), sourceNodeId: z.string().min(1), targetNodeId: z.string().min(1),
  sourceSemanticRole: z.string().min(1), targetSemanticRole: z.string().min(1),
  sourceCanonicalFunction: z.string().min(1), targetCanonicalFunction: z.string().min(1),
  sourceGrounding: groundedNodeSchema, targetGrounding: groundedNodeSchema,
  topologyRole: z.string().min(1), topologyLabel: z.string().min(1),
  topologyCondition: z.string().nullable(), topologyPurpose: z.string().min(1),
  relevantFacts: z.array(z.object({ id: z.string().min(1), kind: z.string().min(1), value: z.string().min(1), entityId: z.string().nullable() }).strict()),
  evidenceReferences: z.array(z.string().min(1)), patternReferences: z.array(z.string().min(1)),
  sourceCardinality: cardinality, targetCardinality: cardinality,
  blockingClarificationReferences: z.array(z.string().min(1)),
  platform: distributedPlannerPlatformSchema, capabilityLimitations: z.array(z.string()),
  allowedEdgeTypes: z.array(stageDEdgeTypeSchema).min(1),
  symbolTableSnapshotHash: z.string().min(1), patternVersion: z.string().min(1),
  capabilityVersion: z.string().min(1),
}).strict();

export const groundedEdgeSchema = z.object({
  contractVersion: z.literal(stageDGroundingContractVersion),
  edgeId: z.string().min(1), sourceNodeId: z.string().min(1), targetNodeId: z.string().min(1),
  edgeType: stageDEdgeTypeSchema, sourceHandle: z.string().min(1), targetHandle: z.string().min(1),
  displayLabel: z.string().min(1), conditionSummary: z.string().nullable(),
  businessReason: z.string().min(1), dataContractSummary: z.array(z.string()),
  sourceCardinality: cardinality, targetCardinality: cardinality,
  cardinalityRelationship: z.string().min(1), factReferences: z.array(z.string().min(1)),
  evidenceReferences: z.array(z.string().min(1)), patternReferences: z.array(z.string().min(1)),
  clarificationReferences: z.array(z.string().min(1)),
  capabilityLimitationReferences: z.array(z.string()),
  groundingMethod: z.enum(['deterministic', 'model-selected', 'unresolved']),
  groundingProvenance: z.array(z.string().min(1)), validationStatus: z.enum(['valid', 'unresolved', 'invalid']),
  unresolvedRequirement: z.string().nullable(),
  selectedEdgeTypeSymbol: z.number().int().positive().nullable(),
}).strict();

export const stageDGroundingReportSchema = z.object({
  contractVersion: z.literal(stageDGroundingContractVersion),
  status: z.enum(['completed', 'partial', 'failed', 'cancelled']),
  topologyHashBefore: z.string().min(1), topologyHashAfter: z.string().min(1),
  topologyUnchanged: z.boolean(), stageCNodeHashBefore: z.string().min(1),
  stageCNodeHashAfter: z.string().min(1), stageCNodesUnchanged: z.boolean(),
  edges: z.array(groundedEdgeSchema), unresolvedEdgeIds: z.array(z.string().min(1)),
  validationIssues: z.array(z.object({ code: z.string().min(1), edgeId: z.string().nullable(), message: z.string().min(1) }).strict()),
  metrics: z.object({
    totalEdges: z.number().int().nonnegative(), deterministicallyGroundedEdges: z.number().int().nonnegative(),
    modelGroundedEdges: z.number().int().nonnegative(), unresolvedEdges: z.number().int().nonnegative(),
    invalidReferences: z.number().int().nonnegative(), genericLabels: z.number().int().nonnegative(),
    branchLabelCorrectness: z.number().min(0).max(1), routeCompleteness: z.number().min(0).max(1),
    loopBoundaryCorrectness: z.number().min(0).max(1), mergeInputCorrectness: z.number().min(0).max(1),
    cardinalityTransitionCorrectness: z.number().min(0).max(1),
    clarificationPreservation: z.number().min(0).max(1), topologyMutations: z.number().int().nonnegative(),
    stageCMutations: z.number().int().nonnegative(), averageDeterministicLatencyMs: z.number().nonnegative(),
    averageModelLatencyMs: z.number().nonnegative(), cacheHits: z.number().int().nonnegative(),
    cacheMisses: z.number().int().nonnegative(), retries: z.number().int().nonnegative(),
  }).strict(),
  persisted: z.literal(false),
}).strict();

export type StageDEdgeType = z.infer<typeof stageDEdgeTypeSchema>;
export type StageDEdgeGroundingInput = z.infer<typeof stageDEdgeGroundingInputSchema>;
export type GroundedEdge = z.infer<typeof groundedEdgeSchema>;
export type StageDGroundingReport = z.infer<typeof stageDGroundingReportSchema>;
