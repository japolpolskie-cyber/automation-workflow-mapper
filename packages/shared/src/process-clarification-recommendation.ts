import { z } from 'zod';

export const processClarificationCategorySchema = z.enum([
  'trigger',
  'outcome',
  'actor-owner',
  'application-system',
  'approval',
  'approval-timeout',
  'wait-resume-condition',
  'retry-policy',
  'loop-termination',
  'synchronization-behavior',
  'error-handling',
]);

export const clarificationAnswerTypeSchema = z.enum([
  'text',
  'boolean',
  'single-choice',
  'multi-choice',
  'duration',
  'application',
  'actor',
]);

export const processClarificationRecommendationSchema = z.object({
  id: z.string().regex(/^process-clarification-[a-z0-9-]+$/),
  category: processClarificationCategorySchema,
  question: z.string().min(1),
  reason: z.string().min(1),
  importance: z.enum(['required', 'recommended', 'optional']),
  sourceRequirementIds: z.array(z.string().min(1)),
  suggestedAnswerType: clarificationAnswerTypeSchema,
}).strict();

export const processClarificationRecommendationsSchema =
  z.array(processClarificationRecommendationSchema);

export type ProcessClarificationCategory = z.infer<typeof processClarificationCategorySchema>;
export type ClarificationAnswerType = z.infer<typeof clarificationAnswerTypeSchema>;
export type ProcessClarificationRecommendation = z.infer<typeof processClarificationRecommendationSchema>;
