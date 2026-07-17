import { describe, expect, it } from 'vitest';
import { normalizeBusinessLanguage } from './scope-language-normalizer.js';

describe('deterministic business-language normalization', () => {
  it('preserves original text and emits evidence-backed canonical concepts', () => {
    const scope = 'A supervisor must sign off, then alert operations and process every attachment.';
    const result = normalizeBusinessLanguage(scope);
    expect(result.originalText).toBe(scope);
    expect(result.concepts.map((item) => item.concept)).toEqual(expect.arrayContaining(['human-approval', 'notification', 'collection']));
    expect(result.concepts.every((item) => scope.slice(item.start, item.end) === item.phrase)).toBe(true);
  });

  it('extracts named choices only from explicit route dimensions', () => {
    const result = normalizeBusinessLanguage('Switch by severity: Routine, Urgent, Critical, or Unknown.');
    expect(result.concepts).toContainEqual(expect.objectContaining({
      concept: 'multi-route-decision',
      routes: ['Routine', 'Urgent', 'Critical', 'Unknown'],
    }));
  });

  it('does not treat schedules as entity collections', () => {
    const result = normalizeBusinessLanguage('Every Monday send a report.');
    expect(result.concepts.some((item) => item.concept === 'collection')).toBe(false);
  });
});
