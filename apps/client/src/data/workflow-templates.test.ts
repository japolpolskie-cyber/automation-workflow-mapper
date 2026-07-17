import { describe, expect, it } from 'vitest';
import { workflowTemplates } from './workflow-templates';

describe('beta workflow template library', () => {
  it('provides ten unique, reviewable business automation requests', () => {
    expect(workflowTemplates).toHaveLength(10);
    expect(new Set(workflowTemplates.map((template) => template.id)).size).toBe(10);
    expect(workflowTemplates.every((template) => template.scope.length > 120)).toBe(true);
    expect(workflowTemplates.every((template) => /\bwhen\b|\bevery\b/i.test(template.scope))).toBe(true);
    expect(workflowTemplates.map((template) => template.name)).toEqual(expect.arrayContaining([
      'Lead Management',
      'Employee Onboarding',
      'Invoice Approval',
      'Customer Support',
      'Order Processing',
      'Marketing Campaign',
      'CRM Follow-up',
      'Document Approval',
      'Social Media Publishing',
      'Inventory Notifications',
    ]));
  });
});
