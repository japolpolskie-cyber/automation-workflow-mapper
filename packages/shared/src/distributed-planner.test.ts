import { describe, expect, it } from 'vitest';
import { businessIntentInputSchema, businessIntentOutputSchema, distributedPlannerContractVersion, distributedPlannerFailureSchema, distributedPlannerRunReportSchema, workflowSkeletonOutputSchema } from './distributed-planner.js';

describe('P2 distributed planner contracts', () => {
  it('keeps all stage contracts strict and versioned', () => {
    expect(distributedPlannerContractVersion).toBe('2.0.0');
    expect(() => businessIntentInputSchema.parse({ runId: 'r', rawScope: 'Create an Asana task', platform: 'n8n', facts: [], clarifications: [], relevantKnowledge: [], extra: true })).toThrow();
    expect(() => businessIntentOutputSchema.parse({ businessObjective: 'Create task' })).toThrow();
    expect(() => workflowSkeletonOutputSchema.parse({ boundary: { entryKey: 'a', exitKeys: ['a'] }, nodes: [], edges: [], binaryConditions: [], routers: [], loops: [], merges: [], blockingClarificationIds: [] })).toThrow();
  });

  it('does not permit product or QA scores in planner stage inputs', () => {
    const serialized = JSON.stringify(businessIntentInputSchema);
    expect(serialized).not.toMatch(/confidence|coverage|reliability|weight|benchmark/i);
  });

  it('requires auditable failures and explicitly non-persisted reports', () => {
    expect(() => distributedPlannerFailureSchema.parse({ category: 'timeout' })).toThrow();
    expect(() => distributedPlannerRunReportSchema.parse({ contractVersion: '2.0.0', persisted: true })).toThrow();
  });
});
