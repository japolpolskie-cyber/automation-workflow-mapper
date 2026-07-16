import { describe, expect, it } from 'vitest';
import { defineApplicationCapabilityPack } from './builders.js';
import { compatibilityCapabilityPackFixture } from './fixtures.js';
import { validateApplicationCapabilityPack } from './validation.js';

describe('application capability SDK', () => {
  it('validates and freezes a declarative capability pack', () => {
    const pack = defineApplicationCapabilityPack(compatibilityCapabilityPackFixture);
    expect(pack.application.id).toBe('fixture-app');
    expect(Object.isFrozen(pack)).toBe(true);
    expect(Object.isFrozen(pack.triggers[0])).toBe(true);
  });
  it('rejects implicit native support without evidence', () => {
    const invalid = { ...compatibilityCapabilityPackFixture, platformMappings: [{
      operationRef: 'record-created', platform: 'n8n' as const, support: 'native' as const,
      connector: { app: 'Fixture', component: 'Trigger', eventOrOperation: 'Created' }, credentialType: 'OAuth', limitationRefs: [], alternative: null,
      evidence: { verification: 'unverified' as const, sourceType: 'connector_catalog' as const, sourceUrl: null, verifiedAt: null, connectorVersion: null },
    }] };
    expect(validateApplicationCapabilityPack(invalid)).toMatchObject({ valid: false, issues: [{ code: 'NATIVE_EVIDENCE_REQUIRED' }] });
  });
});
