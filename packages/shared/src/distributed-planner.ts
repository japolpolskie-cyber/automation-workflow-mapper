import { z } from 'zod';
import { plannerClarificationSchema, plannerFactSchema, structuredWorkflowPlanSchema } from './planner.js';

export const distributedPlannerContractVersion = '2.0.0' as const;
export const distributedPlannerStageIds = ['business-intent', 'workflow-skeleton', 'node-grounding', 'edge-grounding', 'deterministic-assembly', 'deterministic-validation'] as const;
export const distributedPlannerStageIdSchema = z.enum(distributedPlannerStageIds);
export const distributedPlannerStageStateSchema = z.enum(['pending', 'ready', 'running', 'succeeded', 'failed', 'timed-out', 'cancelled', 'skipped', 'blocked-by-clarification', 'cache-hit']);
export const distributedPlannerFailureCategorySchema = z.enum(['invalid-input', 'invalid-output', 'dependency-failure', 'timeout', 'cancellation', 'provider-unavailable', 'provider-connection-failure', 'malformed-model-output', 'unsupported-capability', 'blocking-clarification', 'cache-corruption', 'orchestration-error', 'unknown']);
export const distributedPlannerPlatformSchema = z.enum(['zapier', 'make', 'n8n']);

export const plannerArtifactProvenanceSchema = z.object({
  runId: z.string().min(1),
  stageInstanceId: z.string().min(1),
  stageId: distributedPlannerStageIdSchema,
  stageVersion: z.string().min(1),
  contractVersion: z.literal(distributedPlannerContractVersion),
  runnerId: z.string().min(1),
  modelId: z.string().nullable(),
  scopeHash: z.string().min(1),
  catalogVersion: z.string().min(1),
  detectorVersion: z.string().min(1),
  inputContractVersion: z.string().min(1),
  platform: distributedPlannerPlatformSchema,
  dependencyArtifactIds: z.array(z.string().min(1)),
  createdAt: z.string().datetime(),
}).strict();

const knowledgeReferenceSchema = z.object({ id: z.string().min(1), kind: z.enum(['application', 'manual', 'operation', 'pattern', 'capability']) }).strict();
const baseStageInputSchema = z.object({
  runId: z.string().min(1),
  platform: distributedPlannerPlatformSchema,
  facts: z.array(plannerFactSchema),
  clarifications: z.array(plannerClarificationSchema),
  relevantKnowledge: z.array(knowledgeReferenceSchema),
}).strict();

export const businessIntentInputSchema = baseStageInputSchema.extend({ rawScope: z.string().min(1) }).strict();
export const businessIntentOutputSchema = z.object({
  businessObjective: z.string().min(1),
  actors: z.array(z.string().min(1)),
  systems: z.array(z.string().min(1)),
  businessOutcomes: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
  unresolvedQuestions: z.array(z.object({ clarificationId: z.string().min(1), question: z.string().min(1), blocking: z.boolean() }).strict()),
  decompositionHints: z.array(z.string().min(1)),
  factIds: z.array(z.string().min(1)),
  knowledgeIds: z.array(z.string().min(1)),
}).strict();

const skeletonNodeSchema = z.object({ key: z.string().min(1), canonicalFunctionId: z.string().min(1), title: z.string().min(1), blockedByClarificationIds: z.array(z.string().min(1)) }).strict();
const skeletonEdgeSchema = z.object({ key: z.string().min(1), sourceKey: z.string().min(1), targetKey: z.string().min(1), semanticLabel: z.string().min(1) }).strict();
export const workflowSkeletonInputSchema = z.object({
  runId: z.string().min(1), platform: distributedPlannerPlatformSchema, intent: businessIntentOutputSchema,
  patternIds: z.array(z.string().min(1)), requiredCanonicalFunctions: z.array(z.string().min(1)),
}).strict();
export const workflowSkeletonOutputSchema = z.object({
  boundary: z.object({ entryKey: z.string().min(1), exitKeys: z.array(z.string().min(1)).min(1) }).strict(),
  nodes: z.array(skeletonNodeSchema).min(1), edges: z.array(skeletonEdgeSchema),
  binaryConditions: z.array(z.object({ nodeKey: z.string().min(1), trueTargetKey: z.string().min(1), falseTargetKey: z.string().min(1) }).strict()),
  routers: z.array(z.object({ nodeKey: z.string().min(1), routes: z.array(z.object({ label: z.string().min(1), condition: z.string().min(1), destinationKey: z.string().min(1) }).strict()).min(2) }).strict()),
  loops: z.array(z.object({ nodeKey: z.string().min(1), bodyEntryKey: z.string().min(1), bodyExitKey: z.string().min(1), exitKey: z.string().min(1), terminationCondition: z.string().min(1) }).strict()),
  merges: z.array(z.object({ nodeKey: z.string().min(1), incomingKeys: z.array(z.string().min(1)).min(2), continuationKey: z.string().min(1) }).strict()),
  blockingClarificationIds: z.array(z.string().min(1)),
}).strict();

export const nodeGroundingInputSchema = z.object({
  runId: z.string().min(1), platform: distributedPlannerPlatformSchema, node: skeletonNodeSchema,
  predecessorKeys: z.array(z.string().min(1)), successorKeys: z.array(z.string().min(1)),
  allowedApplicationIds: z.array(z.string().min(1)), allowedOperationIds: z.array(z.string().min(1)),
  allowedCanonicalFunctionIds: z.array(z.string().min(1)), factIds: z.array(z.string().min(1)),
  patternIds: z.array(z.string().min(1)), knowledgeIds: z.array(z.string().min(1)), capabilityIds: z.array(z.string().min(1)),
}).strict();
export const nodeGroundingOutputSchema = z.object({
  nodeKey: z.string().min(1), canonicalFunctionId: z.string().min(1), applicationRef: z.string().nullable(),
  operationRef: z.string().nullable(), inputs: z.array(z.string()), outputs: z.array(z.string()),
  factIds: z.array(z.string().min(1)), patternIds: z.array(z.string().min(1)), knowledgeIds: z.array(z.string().min(1)),
  capabilityIds: z.array(z.string().min(1)), blockedByClarificationIds: z.array(z.string().min(1)),
  limitations: z.array(z.string()), alternatives: z.array(z.string()),
}).strict();

export const edgeGroundingInputSchema = z.object({
  runId: z.string().min(1), platform: distributedPlannerPlatformSchema, edge: skeletonEdgeSchema,
  sourceNode: nodeGroundingOutputSchema, targetNode: nodeGroundingOutputSchema,
  decisionFactIds: z.array(z.string().min(1)), evidenceIds: z.array(z.string().min(1)), patternIds: z.array(z.string().min(1)),
}).strict();
export const edgeGroundingOutputSchema = z.object({
  edgeKey: z.string().min(1), sourceKey: z.string().min(1), targetKey: z.string().min(1),
  sourceHandle: z.string().nullable(), targetHandle: z.string().nullable(), label: z.string().min(1),
  condition: z.string().nullable(), purpose: z.string().min(1), businessReason: z.string().min(1),
  ruleId: z.string().min(1), evidenceIds: z.array(z.string().min(1)).min(1),
}).strict();

export const deterministicAssemblyInputSchema = z.object({
  runId: z.string().min(1), objective: z.string().min(1), platform: distributedPlannerPlatformSchema,
  skeleton: workflowSkeletonOutputSchema, groundedNodes: z.array(nodeGroundingOutputSchema).min(1),
  groundedEdges: z.array(edgeGroundingOutputSchema), blockingClarificationIds: z.array(z.string().min(1)),
}).strict();
export const deterministicAssemblyOutputSchema = z.object({ graph: structuredWorkflowPlanSchema }).strict();

export const deterministicValidationInputSchema = deterministicAssemblyOutputSchema;
export const deterministicValidationOutputSchema = z.object({
  valid: z.boolean(), issueCodes: z.array(z.string().min(1)), graph: structuredWorkflowPlanSchema.nullable(),
}).strict();

export const distributedPlannerFailureSchema = z.object({
  category: distributedPlannerFailureCategorySchema,
  stageInstanceId: z.string().min(1),
  stageId: distributedPlannerStageIdSchema,
  stageVersion: z.string().min(1),
  retryable: z.boolean(),
  retryCount: z.number().int().nonnegative(),
  cause: z.string().min(1),
  userExplanation: z.string().min(1),
  diagnosticDetails: z.record(z.unknown()),
  downstreamSkipped: z.boolean(),
}).strict();

export const stageTransitionSchema = z.object({ from: distributedPlannerStageStateSchema, to: distributedPlannerStageStateSchema, at: z.string().datetime(), reason: z.string().min(1) }).strict();
export const stageExecutionReportSchema = z.object({
  stageInstanceId: z.string().min(1), stageId: distributedPlannerStageIdSchema, stageVersion: z.string().min(1),
  status: distributedPlannerStageStateSchema, dependencies: z.array(z.string().min(1)), attempts: z.number().int().nonnegative(),
  cache: z.enum(['disabled', 'miss', 'hit', 'bypass', 'corrupt']), latencyMs: z.number().nonnegative(),
  transitions: z.array(stageTransitionSchema), artifactId: z.string().nullable(), provenance: plannerArtifactProvenanceSchema.nullable(),
  failure: distributedPlannerFailureSchema.nullable(),
}).strict();
export const distributedPlannerRunReportSchema = z.object({
  contractVersion: z.literal(distributedPlannerContractVersion), runId: z.string().min(1),
  status: z.enum(['completed', 'failed', 'cancelled', 'blocked']), startedAt: z.string().datetime(), completedAt: z.string().datetime(),
  durationMs: z.number().nonnegative(), stageSequence: z.array(z.string().min(1)),
  stages: z.array(stageExecutionReportSchema), finalGraph: structuredWorkflowPlanSchema.nullable(),
  persisted: z.literal(false),
}).strict();

export type DistributedPlannerStageId = z.infer<typeof distributedPlannerStageIdSchema>;
export type DistributedPlannerStageState = z.infer<typeof distributedPlannerStageStateSchema>;
export type DistributedPlannerFailureCategory = z.infer<typeof distributedPlannerFailureCategorySchema>;
export type PlannerArtifactProvenance = z.infer<typeof plannerArtifactProvenanceSchema>;
export type DistributedPlannerRunReport = z.infer<typeof distributedPlannerRunReportSchema>;
