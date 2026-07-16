import { z } from 'zod';
import { businessIntentOutputSchema, distributedPlannerPlatformSchema } from './distributed-planner.js';
import { plannerClarificationSchema, plannerEvidenceSchema, plannerFactSchema, plannerKnowledgeEntrySchema } from './planner.js';

export const p3ContractVersion = '3.0.0' as const;
const referencesSchema = z.object({ factIds: z.array(z.string().min(1)), evidenceIds: z.array(z.string().min(1)), knowledgeIds: z.array(z.string().min(1)) }).strict();

export const p3BusinessIntentInputSchema = z.object({
  contractVersion: z.literal(p3ContractVersion), runId: z.string().min(1), rawScope: z.string().min(1),
  platform: distributedPlannerPlatformSchema, facts: z.array(plannerFactSchema), clarifications: z.array(plannerClarificationSchema),
  patterns: z.array(plannerKnowledgeEntrySchema), evidence: z.array(plannerEvidenceSchema),
}).strict();
export const p3BusinessIntentOutputSchema = businessIntentOutputSchema.extend({
  sourceSystems: z.array(z.string().min(1)), destinationSystems: z.array(z.string().min(1)),
  businessEntities: z.array(z.string().min(1)), explicitBusinessRules: z.array(z.string().min(1)),
  workflowBoundaryCandidates: z.array(z.object({ temporaryId: z.string().min(1), title: z.string().min(1), purpose: z.string().min(1), factIds: z.array(z.string().min(1)) }).strict()).min(1),
}).strict();

export const p3WorkflowSkeletonInputSchema = z.object({
  contractVersion: z.literal(p3ContractVersion), runId: z.string().min(1), platform: distributedPlannerPlatformSchema,
  intent: p3BusinessIntentOutputSchema, facts: z.array(plannerFactSchema), evidence: z.array(plannerEvidenceSchema),
  clarifications: z.array(plannerClarificationSchema), patterns: z.array(plannerKnowledgeEntrySchema),
  allowedCanonicalFunctions: z.array(z.string().min(1)),
  topologyConstraints: z.array(z.string().min(1)),
}).strict();

const skeletonNodePreviewSchema = referencesSchema.extend({
  key: z.string().min(1), canonicalFunctionId: z.string().min(1), title: z.string().min(1),
  blockedByClarificationIds: z.array(z.string().min(1)), unresolvedGroundingRequirements: z.array(z.string().min(1)),
}).strict();
const skeletonEdgePreviewSchema = referencesSchema.pick({ evidenceIds: true }).extend({
  key: z.string().min(1), sourceKey: z.string().min(1), targetKey: z.string().min(1), label: z.string().min(1), condition: z.string().nullable(),
}).strict();
export const p3WorkflowSkeletonOutputSchema = z.object({
  workflows: z.array(z.object({
    temporaryWorkflowId: z.string().min(1), title: z.string().min(1), boundaryCandidateId: z.string().min(1),
    entryNodeKey: z.string().min(1), exitNodeKeys: z.array(z.string().min(1)).min(1),
    nodes: z.array(skeletonNodePreviewSchema).min(1), edges: z.array(skeletonEdgePreviewSchema),
    binaryConditions: z.array(z.object({ nodeKey: z.string().min(1), trueEdgeKey: z.string().min(1), falseEdgeKey: z.string().min(1) }).strict()),
    routers: z.array(z.object({ nodeKey: z.string().min(1), routes: z.array(z.object({ label: z.string().min(1), condition: z.string().min(1), destinationKey: z.string().min(1), edgeKey: z.string().min(1) }).strict()).min(2) }).strict()),
    loops: z.array(z.object({ nodeKey: z.string().min(1), entryEdgeKey: z.string().min(1), bodyEntryKey: z.string().min(1), bodyExitKey: z.string().min(1), exitEdgeKey: z.string().min(1), stopBoundary: z.string().min(1) }).strict()),
    merges: z.array(z.object({ nodeKey: z.string().min(1), incomingEdgeKeys: z.array(z.string().min(1)).min(2), continuationEdgeKey: z.string().min(1) }).strict()),
    blockingClarificationIds: z.array(z.string().min(1)),
  }).strict()).min(1),
}).strict();

export type P3BusinessIntentInput = z.infer<typeof p3BusinessIntentInputSchema>;
export type P3BusinessIntentOutput = z.infer<typeof p3BusinessIntentOutputSchema>;
export type P3WorkflowSkeletonInput = z.infer<typeof p3WorkflowSkeletonInputSchema>;
export type P3WorkflowSkeletonOutput = z.infer<typeof p3WorkflowSkeletonOutputSchema>;
