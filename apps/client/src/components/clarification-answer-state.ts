import type { ProcessClarificationRecommendation, SubmittedClarificationAnswer } from '@awm/shared';

export type DurationAnswer = { value: string; unit: 'minutes' | 'hours' | 'days' | 'weeks' };
export type LocalClarificationAnswer = string | string[] | DurationAnswer | boolean;
export type LocalClarificationAnswers = Record<string, LocalClarificationAnswer>;

export function normalizeClarificationAnswers(
  recommendations: readonly ProcessClarificationRecommendation[],
  answers: LocalClarificationAnswers,
): SubmittedClarificationAnswer[] {
  return recommendations.flatMap((recommendation) => {
    const answer = answers[recommendation.id];
    const base = {
      recommendationId: recommendation.id,
      answerType: recommendation.suggestedAnswerType,
      sourceRecommendationCategory: recommendation.category,
    };
    if (typeof answer === 'string') {
      const value = answer.trim();
      if (!value) return [];
      if (recommendation.suggestedAnswerType === 'boolean' || recommendation.suggestedAnswerType === 'duration' || recommendation.suggestedAnswerType === 'multi-choice') return [];
      return [{ ...base, answerType: recommendation.suggestedAnswerType, value } as SubmittedClarificationAnswer];
    }
    if (Array.isArray(answer)) {
      if (recommendation.suggestedAnswerType !== 'multi-choice') return [];
      const value = [...new Set(answer.map((item) => item.trim()).filter(Boolean))];
      return value.length ? [{ ...base, answerType: 'multi-choice' as const, value }] : [];
    }
    if (isDurationAnswer(answer) && recommendation.suggestedAnswerType === 'duration') {
      const value = Number(answer.value);
      return Number.isFinite(value) && value > 0
        ? [{ ...base, answerType: 'duration' as const, value: { value, unit: answer.unit } }]
        : [];
    }
    if (recommendation.suggestedAnswerType === 'boolean' && (answer === true || answer === false)) {
      return [{ ...base, answerType: 'boolean' as const, value: answer }];
    }
    return [];
  });
}

export function isDurationAnswer(answer: LocalClarificationAnswer | undefined): answer is DurationAnswer {
  return Boolean(answer && typeof answer === 'object' && !Array.isArray(answer) && 'value' in answer && 'unit' in answer);
}
