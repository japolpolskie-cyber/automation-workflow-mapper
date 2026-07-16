import { describe, expect, it } from 'vitest';
import { analysisProgressEventSchema } from './analysis-progress.js';

describe('AnalysisProgressEvent contract', () => {
  it('accepts a version-neutral progress event', () => {
    const event = analysisProgressEventSchema.parse({ analysisId: '00000000-0000-4000-8000-000000000001', sequence: 0, stage: 'preparing', state: 'running', percent: 0, message: 'Preparing workflow analysis.', occurredAt: '2026-07-16T00:00:00.000Z' });
    expect(event.stage).toBe('preparing');
  });

  it('rejects progress outside 0 to 100', () => {
    expect(analysisProgressEventSchema.safeParse({ analysisId: '00000000-0000-4000-8000-000000000001', sequence: 0, stage: 'planning', state: 'running', percent: 101, message: 'Planning.', occurredAt: '2026-07-16T00:00:00.000Z' }).success).toBe(false);
  });
});
