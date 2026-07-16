import { describe, expect, it } from 'vitest';
import { knowledgeContextSchema } from './knowledge-context.js';

describe('KnowledgeContext contract', () => {
  it('captures retrieved knowledge and allowed capabilities without carrying the full catalog', () => {
    const context = knowledgeContextSchema.parse({ version: '1.0', planningFactsVersion: '1.0', catalogVersion: 'not-active-yet', retrieved: [{ kind: 'pattern', id: 'follow-up-until-response', score: .97, reason: 'The scope repeats follow-ups until a response.' }], allowedCapabilities: [{ canonicalFunctionId: 'binary-condition' }, { canonicalFunctionId: 'action', applicationId: 'gmail', operationId: 'send-email' }], hardRules: ['Every loop must have a finite boundary.'], estimatedCharacters: 420, createdAt: '2026-07-16T00:00:00.000Z' });
    expect(context.retrieved).toHaveLength(1);
    expect(context.allowedCapabilities[1]).toMatchObject({ applicationId: 'gmail', operationId: 'send-email', limitation: null });
  });
});
