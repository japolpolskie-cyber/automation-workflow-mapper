import { z } from 'zod';

export const requirementSourceReferenceSchema = z.object({
  segmentId: z.string().min(1),
  stepId: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  text: z.string().min(1),
}).strict();

export const tracedRequirementValueSchema = z.object({
  value: z.string().min(1),
  factIds: z.array(z.string().min(1)),
  evidenceIds: z.array(z.string().min(1)),
  sourceReferences: z.array(requirementSourceReferenceSchema),
}).strict();

export const normalizedRequirementAnalysisSchema = z.object({
  version: z.literal('2.1'),
  objective: z.string().min(1),
  trigger: tracedRequirementValueSchema.nullable(),
  endStates: z.array(tracedRequirementValueSchema),
  entities: z.array(tracedRequirementValueSchema),
  applications: z.array(tracedRequirementValueSchema),
  actors: z.array(tracedRequirementValueSchema),
  identifiers: z.array(tracedRequirementValueSchema),
  lifecycleStages: z.array(tracedRequirementValueSchema),
  statuses: z.array(tracedRequirementValueSchema),
  decisions: z.array(tracedRequirementValueSchema),
  waits: z.array(tracedRequirementValueSchema),
  repetitions: z.array(tracedRequirementValueSchema),
  approvals: z.array(tracedRequirementValueSchema),
  retries: z.array(tracedRequirementValueSchema),
  errorHandling: z.array(tracedRequirementValueSchema),
  duplicatePrevention: z.array(tracedRequirementValueSchema),
  auditRequirements: z.array(tracedRequirementValueSchema),
  assumptions: z.array(tracedRequirementValueSchema),
  uncertainties: z.array(tracedRequirementValueSchema),
}).strict();

export type RequirementSourceReference = z.infer<typeof requirementSourceReferenceSchema>;
export type NormalizedRequirementAnalysis = z.infer<typeof normalizedRequirementAnalysisSchema>;
