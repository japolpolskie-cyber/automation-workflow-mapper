import { z } from 'zod';
import { normalizedRequirementAnalysisSchema } from './normalized-requirement-analysis.js';
import { semanticRequirementAnalysisSchema } from './semantic-requirements.js';
import { tracedRequirementValueSchema } from './normalized-requirement-analysis.js';

const processSignalSchema = tracedRequirementValueSchema;

export const processWaitSchema = processSignalSchema.extend({
  kind: z.enum(['duration', 'event', 'unspecified']),
}).strict();

export const processAnalysisSchema = z.object({
  version: z.literal('1.0'),
  originalRequirements: z.string().min(1),
  normalizedRequirements: z.string().min(1),
  businessObjective: z.string().min(1),
  actors: z.array(processSignalSchema),
  externalSystems: z.array(processSignalSchema),
  triggers: z.array(processSignalSchema),
  outcomes: z.array(processSignalSchema),
  approvals: z.array(processSignalSchema),
  waits: z.array(processWaitSchema),
  retries: z.array(processSignalSchema),
  loops: z.array(processSignalSchema),
  synchronizations: z.array(processSignalSchema),
  missingInformation: z.array(processSignalSchema),
  requirementAnalysis: normalizedRequirementAnalysisSchema,
  semanticAnalysis: semanticRequirementAnalysisSchema,
}).strict();

export type ProcessSignal = z.infer<typeof processSignalSchema>;
export type ProcessWait = z.infer<typeof processWaitSchema>;
export type ProcessAnalysis = z.infer<typeof processAnalysisSchema>;
