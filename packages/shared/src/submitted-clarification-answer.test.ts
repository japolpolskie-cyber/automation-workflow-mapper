import { describe, expect, it } from 'vitest';
import { analyzeWorkflowRequestSchema } from './domain.js';
import { submittedClarificationAnswersSchema } from './submitted-clarification-answer.js';

const projectId = '00000000-0000-4000-8000-000000000001';

describe('submitted clarification answer contracts', () => {
  it('keeps legacy analysis requests valid', () => {
    expect(analyzeWorkflowRequestSchema.parse({ projectId })).toEqual({ projectId, workflowMode: 'auto' });
  });

  it('accepts every normalized answer type', () => {
    const clarificationAnswers = [
      { recommendationId: 'text', answerType: 'text', value: 'Details' },
      { recommendationId: 'boolean', answerType: 'boolean', value: true },
      { recommendationId: 'single', answerType: 'single-choice', value: 'Approved' },
      { recommendationId: 'multi', answerType: 'multi-choice', value: ['Finance', 'Operations'] },
      { recommendationId: 'duration', answerType: 'duration', value: { value: 2, unit: 'days' } },
      { recommendationId: 'application', answerType: 'application', value: 'Asana' },
      { recommendationId: 'actor', answerType: 'actor', value: 'Finance manager', sourceRecommendationCategory: 'actor-owner' },
    ];

    expect(analyzeWorkflowRequestSchema.parse({ projectId, clarificationAnswers }).clarificationAnswers).toEqual(clarificationAnswers);
  });

  it('rejects structurally invalid and duplicate answers', () => {
    expect(submittedClarificationAnswersSchema.safeParse([
      { recommendationId: 'empty', answerType: 'text', value: ' ' },
    ]).success).toBe(false);
    expect(submittedClarificationAnswersSchema.safeParse([
      { recommendationId: 'same', answerType: 'boolean', value: true },
      { recommendationId: 'same', answerType: 'boolean', value: false },
    ]).success).toBe(false);
  });
});
