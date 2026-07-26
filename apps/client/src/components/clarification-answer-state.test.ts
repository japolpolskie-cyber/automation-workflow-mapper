import { describe, expect, it } from 'vitest';
import type { ProcessClarificationRecommendation } from '@awm/shared';
import { normalizeClarificationAnswers } from './clarification-answer-state';

const recommendation = (
  id: string,
  suggestedAnswerType: ProcessClarificationRecommendation['suggestedAnswerType'],
): ProcessClarificationRecommendation => ({
  id: `process-clarification-${id}`,
  category: 'outcome',
  question: 'Question?',
  reason: 'Reason',
  importance: 'recommended',
  sourceRequirementIds: [],
  suggestedAnswerType,
});

describe('clarification answer normalization', () => {
  it('normalizes supported answered values and preserves stable IDs', () => {
    const recommendations = [
      recommendation('text', 'text'),
      recommendation('boolean', 'boolean'),
      recommendation('single', 'single-choice'),
      recommendation('multi', 'multi-choice'),
      recommendation('duration', 'duration'),
      recommendation('application', 'application'),
      recommendation('actor', 'actor'),
    ];
    const result = normalizeClarificationAnswers(recommendations, {
      'process-clarification-text': '  details  ',
      'process-clarification-boolean': false,
      'process-clarification-single': 'Approved',
      'process-clarification-multi': ['Finance', 'Finance', 'Operations'],
      'process-clarification-duration': { value: '2', unit: 'days' },
      'process-clarification-application': 'Asana',
      'process-clarification-actor': 'Finance manager',
    });

    expect(result).toHaveLength(7);
    expect(result[0]).toMatchObject({ recommendationId: 'process-clarification-text', value: 'details' });
    expect(result[1]).toMatchObject({ answerType: 'boolean', value: false });
    expect(result[3]).toMatchObject({ value: ['Finance', 'Operations'] });
    expect(result[4]).toMatchObject({ value: { value: 2, unit: 'days' } });
  });

  it('omits empty and malformed local values', () => {
    const recommendations = [
      recommendation('text', 'text'),
      recommendation('duration', 'duration'),
      recommendation('multi', 'multi-choice'),
    ];
    expect(normalizeClarificationAnswers(recommendations, {
      'process-clarification-text': ' ',
      'process-clarification-duration': { value: '0', unit: 'hours' },
      'process-clarification-multi': [],
    })).toEqual([]);
  });
});
