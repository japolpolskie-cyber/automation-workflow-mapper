import { z } from 'zod';
import { processClarificationCategorySchema } from './process-clarification-recommendation.js';

const answerBaseSchema = z.object({
  recommendationId: z.string().min(1),
  sourceRecommendationCategory: processClarificationCategorySchema.optional(),
});

const textValueSchema = z.string().trim().min(1);

export const submittedClarificationAnswerSchema = z.discriminatedUnion('answerType', [
  answerBaseSchema.extend({ answerType: z.literal('text'), value: textValueSchema }).strict(),
  answerBaseSchema.extend({ answerType: z.literal('boolean'), value: z.boolean() }).strict(),
  answerBaseSchema.extend({ answerType: z.literal('single-choice'), value: textValueSchema }).strict(),
  answerBaseSchema.extend({ answerType: z.literal('multi-choice'), value: z.array(textValueSchema).min(1) }).strict(),
  answerBaseSchema.extend({
    answerType: z.literal('duration'),
    value: z.object({
      value: z.number().positive(),
      unit: z.enum(['minutes', 'hours', 'days', 'weeks']),
    }).strict(),
  }).strict(),
  answerBaseSchema.extend({ answerType: z.literal('application'), value: textValueSchema }).strict(),
  answerBaseSchema.extend({ answerType: z.literal('actor'), value: textValueSchema }).strict(),
]);

export const submittedClarificationAnswersSchema = z.array(submittedClarificationAnswerSchema).superRefine((answers, context) => {
  const seen = new Set<string>();
  answers.forEach((answer, index) => {
    if (seen.has(answer.recommendationId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate clarification recommendation IDs are not allowed.',
        path: [index, 'recommendationId'],
      });
    }
    seen.add(answer.recommendationId);
  });
});

export type SubmittedClarificationAnswer = z.infer<typeof submittedClarificationAnswerSchema>;
