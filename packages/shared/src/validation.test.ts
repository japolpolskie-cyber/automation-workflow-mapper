import { describe, expect, it } from 'vitest';
import { leadQualificationWorkflow } from './fixtures.js';
import { validateWorkflow } from './validation.js';

describe('workflow validation', () => {
  it('detects missing configuration and returns complexity statistics', () => {
    const result = validateWorkflow(leadQualificationWorkflow, 'n8n');
    expect(result.statistics.nodes).toBe(leadQualificationWorkflow.nodes.length);
    expect(result.complexityScore).toBeGreaterThan(0);
    expect(result.issues.some((issue) => issue.code === 'PII_REVIEW')).toBe(true);
  });

  it('requires mappings for required inputs', () => {
    const workflow = structuredClone(leadQualificationWorkflow);
    workflow.nodes[1]!.inputs = [{ key: 'email', label: 'Email', dataType: 'string', required: true }];
    expect(validateWorkflow(workflow, 'zapier').issues).toContainEqual(expect.objectContaining({ code: 'REQUIRED_INPUT_UNMAPPED', nodeId: workflow.nodes[1]!.id }));
  });
});
