import { compatibilityCapabilityPackFixture } from '@awm/capability-sdk';
import { generatedCapabilityPacks } from '@awm/capability-registry';
import { describe, expect, it } from 'vitest';
import { applicationPacks, legacyApplicationPacks } from './application-packs.js';
import { adaptCapabilityPackToKnowledge } from './sdk-compatibility.js';

describe('capability SDK knowledge compatibility', () => {
  it('adapts a capability pack without losing stable operation semantics', () => {
    expect(adaptCapabilityPackToKnowledge(compatibilityCapabilityPackFixture)).toMatchObject({
      applicationId: 'fixture-app',
      aliases: ['fixture'],
      operations: [{
        operationId: 'record-created',
        canonicalFunctionId: 'trigger',
        acceptedInputCardinality: ['single'],
        producedOutputCardinality: 'single',
        batchSupported: false,
        catalogVersion: '1.0.0',
      }],
      catalogVersion: '1.0.0',
    });
  });
  it('keeps the current knowledge catalog unchanged while the generated manifest is empty', () => {
    expect(generatedCapabilityPacks).toEqual([]);
    expect(applicationPacks).toEqual(legacyApplicationPacks);
  });
});
