import { describe, expect, it } from 'vitest';
import { canonicalWorkflowSchema } from './domain.js';
import { leadQualificationScope, leadQualificationWorkflow } from './fixtures.js';

describe('lead qualification fixture', () => {
  it('is strict-schema compatible and covers the expected requirements', () => {
    expect(canonicalWorkflowSchema.parse(leadQualificationWorkflow)).toEqual(leadQualificationWorkflow);
    const names = leadQualificationWorkflow.nodes.map((node) => `${node.name} ${node.service}`.toLowerCase());
    for (const expected of ['facebook', 'validate email', 'apollo', 'hubspot', 'slack', 'google sheets', 'log execution']) {
      expect(names.some((name) => name.includes(expected))).toBe(true);
    }
    expect(leadQualificationWorkflow.errorHandling).toHaveLength(1);
    expect(leadQualificationScope).toContain('If Apollo fails');
  });
});
