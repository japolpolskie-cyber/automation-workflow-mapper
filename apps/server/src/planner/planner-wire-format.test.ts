import { describe, expect, it } from 'vitest';
import { structuredWorkflowPlanSchema } from '@awm/shared';
import { compactPlannerPlanSchema, expandCompactPlannerPlan } from './planner-wire-format.js';

describe('K4.2 compact planner wire format', () => {
  it('expands into the unchanged K4.1 execution graph contract', () => {
    const compact = compactPlannerPlanSchema.parse({
      v: '1.1', o: 'Notify Slack', p: 'n8n', entry: 'a',
      n: [{ i: 'a', f: 'notification', t: 'Notify Slack', a: 'slack', o: 'slack.send-message', in: ['message'], out: ['result'], facts: ['fact-1'], patterns: [], k: ['slack.send-message'], caps: ['n8n.notification'], blocks: [], limits: [] }],
      e: [], b: [], r: [], m: [], l: [], y: [], c: [], w: [],
    });
    const expanded = expandCompactPlannerPlan(compact);
    expect(structuredWorkflowPlanSchema.parse(expanded)).toMatchObject({ version: '1.1', entryNodeId: 'a', nodes: [{ canonicalFunctionId: 'notification' }] });
  });
});
