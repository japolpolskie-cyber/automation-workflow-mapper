import { z } from 'zod';

export const analysisStageSchema = z.enum(['preparing', 'understanding', 'retrieving', 'planning', 'validating', 'repairing', 'mapping', 'persisting', 'complete']);
export const analysisProgressStateSchema = z.enum(['running', 'completed', 'failed']);

export const analysisProgressEventSchema = z.object({
  analysisId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  stage: analysisStageSchema,
  state: analysisProgressStateSchema,
  percent: z.number().int().min(0).max(100),
  message: z.string().min(1).max(500),
  occurredAt: z.string().datetime(),
}).strict();

export type AnalysisStage = z.infer<typeof analysisStageSchema>;
export type AnalysisProgressState = z.infer<typeof analysisProgressStateSchema>;
export type AnalysisProgressEvent = z.infer<typeof analysisProgressEventSchema>;
