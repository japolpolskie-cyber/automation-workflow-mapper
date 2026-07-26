import { z } from 'zod';
import { semanticRequirementAnalysisSchema } from './semantic-requirements.js';
import { processAnalysisSchema } from './process-analysis.js';
import {
  normalizedRequirementAnalysisSchema,
  requirementSourceReferenceSchema as sourceReferenceSchema,
} from './normalized-requirement-analysis.js';

export {
  normalizedRequirementAnalysisSchema,
  requirementSourceReferenceSchema,
  tracedRequirementValueSchema,
} from './normalized-requirement-analysis.js';
export type {
  NormalizedRequirementAnalysis,
  RequirementSourceReference,
} from './normalized-requirement-analysis.js';

export const lifecycleCapabilityGroupSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  purpose: z.string().min(1),
  entity: z.string().nullable(),
  lifecycleStage: z.string().nullable(),
  outcome: z.string().nullable(),
  operationFactIds: z.array(z.string().min(1)).min(1),
  evidenceIds: z.array(z.string().min(1)),
  sourceReferences: z.array(sourceReferenceSchema).min(1),
  underlyingOperations: z.array(z.object({
    factId: z.string().min(1),
    operation: z.string().min(1),
    sourceReference: sourceReferenceSchema,
  }).strict()).min(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
}).strict();

export const controlFlowTypeSchema = z.enum([
  'binary-decision', 'multi-outcome-decision', 'parallel-split',
  'conditional-parallel-routing', 'merge-all', 'merge-any', 'human-review',
  'approval', 'event-wait', 'delay', 'filter', 'iterator', 'loop-until',
  'retry', 'aggregator', 'error-handler', 'resume-point', 'subworkflow',
  'termination',
]);

export const controlFlowClassificationSchema = z.object({
  id: z.string().min(1),
  type: controlFlowTypeSchema,
  factIds: z.array(z.string().min(1)),
  evidenceIds: z.array(z.string().min(1)),
  sourceReferences: z.array(sourceReferenceSchema).min(1),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1),
  branchExclusivity: z.enum(['exclusive', 'non-exclusive', 'not-applicable']),
  branchesMayExecuteTogether: z.boolean(),
  synchronizationRequired: z.boolean(),
  wait: z.object({
    kind: z.enum(['human', 'external-event', 'duration']),
    resumeCondition: z.string().min(1),
  }).strict().nullable(),
  loop: z.object({
    target: z.string().min(1),
    exitCondition: z.string().min(1),
  }).strict().nullable(),
  collectionSource: z.string().min(1).nullable(),
  retryPolicy: z.object({
    maximumAttempts: z.number().int().positive().nullable(),
    backoff: z.string().min(1).nullable(),
  }).strict().nullable(),
}).strict();

export const v21AnalysisArtifactsSchema = z.object({
  version: z.literal('2.1'),
  shadowMode: z.literal(true),
  processAnalysis: processAnalysisSchema.optional(),
  semanticAnalysis: semanticRequirementAnalysisSchema.optional(),
  requirementAnalysis: normalizedRequirementAnalysisSchema,
  capabilityGroups: z.array(lifecycleCapabilityGroupSchema),
  controlFlow: z.array(controlFlowClassificationSchema),
}).strict();

export type LifecycleCapabilityGroup = z.infer<typeof lifecycleCapabilityGroupSchema>;
export type ControlFlowType = z.infer<typeof controlFlowTypeSchema>;
export type ControlFlowClassification = z.infer<typeof controlFlowClassificationSchema>;
export type V21AnalysisArtifacts = z.infer<typeof v21AnalysisArtifactsSchema>;
