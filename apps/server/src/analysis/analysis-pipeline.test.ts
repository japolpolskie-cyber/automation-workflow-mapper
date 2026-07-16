import { describe, expect, it } from 'vitest';
import type { AnalysisProgressEvent } from '@awm/shared';
import { AnalysisPipeline } from './analysis-pipeline.js';

describe('AnalysisPipeline compatibility boundary', () => {
  it('returns the operation result unchanged and reports terminal progress', async () => {
    const events: AnalysisProgressEvent[] = [];
    const pipeline = new AnalysisPipeline((event) => { events.push(event); });
    const result = await pipeline.run(async (context) => {
      await context.report('validating', 80, 'Validating the unchanged workflow.');
      return { workflowId: 'stable-result', nodes: 5 };
    });
    expect(result).toEqual({ workflowId: 'stable-result', nodes: 5 });
    expect(events.map((event) => [event.stage, event.state, event.percent])).toEqual([
      ['preparing', 'running', 0],
      ['validating', 'running', 80],
      ['complete', 'completed', 100],
    ]);
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2]);
  });

  it('does not let an observability failure change generation behavior', async () => {
    const pipeline = new AnalysisPipeline(() => { throw new Error('telemetry unavailable'); });
    await expect(pipeline.run(async () => 'canonical-result')).resolves.toBe('canonical-result');
  });

  it('rethrows the original operation error after reporting failure', async () => {
    const events: AnalysisProgressEvent[] = [];
    const pipeline = new AnalysisPipeline((event) => { events.push(event); });
    const failure = new Error('provider failed');
    await expect(pipeline.run(async () => { throw failure; })).rejects.toBe(failure);
    expect(events.at(-1)).toMatchObject({ stage: 'complete', state: 'failed', percent: 100 });
  });
});
