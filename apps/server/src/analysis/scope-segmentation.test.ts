import { describe, expect, it } from 'vitest';
import { segmentScope } from './scope-segmentation.js';

describe('K3.1 scope segmentation', () => {
  it('preserves source offsets while splitting steps and clauses', () => {
    const scope = 'When a lead arrives, create a task, then notify Slack.\nIf it fails, retry twice; otherwise continue.';
    const segments = segmentScope(scope);
    expect(segments.filter((item) => item.kind === 'step')).toHaveLength(3);
    expect(segments.some((item) => item.kind === 'clause')).toBe(true);
    for (const segment of segments) expect(scope.slice(segment.start, segment.end)).toBe(segment.text);
    expect(segments.filter((item) => item.kind === 'clause').every((item) => segments.some((step) => step.kind === 'step' && step.id === item.stepId))).toBe(true);
  });
});
