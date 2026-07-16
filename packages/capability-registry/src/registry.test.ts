import { compatibilityCapabilityPackFixture } from '@awm/capability-sdk';
import { describe, expect, it } from 'vitest';
import { generatedCapabilityPacks } from './generated-manifest.js';
import { CapabilityRegistryError, DeterministicCapabilityRegistry } from './registry.js';

describe('deterministic capability registry', () => {
  it('keeps the generated foundation manifest empty until a pack is approved', () => {
    expect(generatedCapabilityPacks).toEqual([]);
  });
  it('indexes aliases and operations deterministically', () => {
    const registry = new DeterministicCapabilityRegistry([compatibilityCapabilityPackFixture]);
    expect(registry.getApplication('Fixture')).toMatchObject({ application: { id: 'fixture-app' } });
    expect(registry.getOperation('fixture-app', 'record-created')).toMatchObject({ kind: 'trigger' });
    expect(registry.findOperations({ kinds: ['trigger'], limit: 10 })).toHaveLength(1);
  });
  it('rejects global alias collisions', () => {
    const conflicting = { ...compatibilityCapabilityPackFixture, packId: 'com.example.second', application: { ...compatibilityCapabilityPackFixture.application, id: 'second-app' } };
    expect(() => new DeterministicCapabilityRegistry([compatibilityCapabilityPackFixture, conflicting])).toThrow(CapabilityRegistryError);
  });
});
