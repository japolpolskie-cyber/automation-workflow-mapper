import { describe, expect, it } from 'vitest';
import { canonicalWorkflowSchema, createProjectSchema, fieldSchema } from './domain.js';

describe('createProjectSchema', () => {
  it('accepts a valid project', () => {
    expect(createProjectSchema.parse({ name: 'Lead routing', platform: 'n8n' }).name).toBe('Lead routing');
  });

  it('rejects unknown properties', () => {
    expect(() => createProjectSchema.parse({ name: 'Test', platform: 'zapier', admin: true })).toThrow();
  });
});

describe('canonicalWorkflowSchema compatibility', () => {
  it('treats AI fields without a required flag as optional', () => {
    expect(fieldSchema.parse({ key: 'folderUrl', label: 'Folder URL', dataType: 'string' }).required).toBe(false);
  });
  it('upgrades earlier workflow records through safe defaults', () => {
    const now = new Date().toISOString();
    const workflow = canonicalWorkflowSchema.parse({ schemaVersion: '1.0', id: crypto.randomUUID(), name: 'Legacy draft', targetPlatform: 'zapier', createdAt: now, updatedAt: now });
    expect(workflow).toMatchObject({ branches: [], errorHandling: [], clarificationQuestions: [], risks: [], complexity: 'simple' });
  });
});
