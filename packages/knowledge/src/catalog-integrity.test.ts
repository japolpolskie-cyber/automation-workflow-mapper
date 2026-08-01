import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveApplication } from '@awm/shared';
import { describe, expect, it } from 'vitest';
import { applicationPacks, getApplicationPack, getOperation } from './application-packs.js';
import { canonicalFunctionRegistry } from './canonical-registry.js';
import { platformCapabilities } from './platform-capabilities.js';
import { canonicalFunctionIds } from './types.js';

describe('knowledge catalog integrity', () => {
  it.each([
    ['google-calendar', ['find-calendar-event', 'create-calendar-event', 'update-calendar-event']],
    ['outlook', ['outlook-new-email', 'outlook-send-email', 'create-email-draft']],
  ])('provides the bounded verified %s operation pack', (applicationId, operationIds) => {
    const pack = getApplicationPack(applicationId);
    expect(pack?.operations.map((operation) => operation.operationId)).toEqual(operationIds);
    for (const operationId of operationIds) {
      const operation = getOperation(applicationId, operationId)!;
      expect(operation.knownPlatformMappings.map((mapping) => [mapping.platform, mapping.support])).toEqual([
        ['n8n', 'native'], ['make', 'native'], ['zapier', 'native'],
      ]);
    }
  });

  it.each([
    ['google-calendar', 'list-events'],
    ['google-calendar', 'delete-event'],
    ['outlook', 'search-messages'],
    ['outlook', 'retrieve-attachments'],
    ['outlook', 'create-calendar-event'],
  ])('does not claim an unverified operation: %s.%s', (applicationId, operationId) => {
    expect(getOperation(applicationId, operationId)).toBeUndefined();
  });

  it('registers every canonical function exactly once', () => {
    const ids = canonicalFunctionRegistry.map((item) => item.id);
    expect(ids).toEqual(canonicalFunctionIds);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses unique application and operation IDs with valid references', () => {
    const applicationIds = applicationPacks.map((item) => item.applicationId);
    const operations = applicationPacks.flatMap((item) => item.operations);
    const operationIds = operations.map((item) => item.operationId);
    expect(new Set(applicationIds).size).toBe(applicationIds.length);
    expect(new Set(operationIds).size).toBe(operationIds.length);
    for (const application of applicationPacks) for (const operation of application.operations) {
      expect(operation.applicationId).toBe(application.applicationId);
      expect(canonicalFunctionRegistry.some((item) => item.id === operation.canonicalFunctionId)).toBe(true);
    }
  });

  it('keeps cardinality and batch declarations internally consistent', () => {
    for (const definition of canonicalFunctionRegistry) expect(definition.acceptedCardinality.length).toBeGreaterThan(0);
    for (const operation of applicationPacks.flatMap((item) => item.operations)) {
      expect(operation.acceptedInputCardinality.length).toBeGreaterThan(0);
      if (operation.batchSupported) expect(operation.acceptedInputCardinality).toContain('collection');
      if (operation.acceptedInputCardinality.length === 1 && operation.acceptedInputCardinality[0] === 'single') expect(operation.batchSupported).toBe(false);
    }
    expect(getApplicationPack('Google Sheets')?.operations.find((item) => item.operationId === 'add-row')).toMatchObject({ acceptedInputCardinality: ['single'], batchSupported: false });
  });

  it('requires limitations and alternatives for unsupported or unknown mappings', () => {
    const mappings = applicationPacks.flatMap((item) => item.operations).flatMap((item) => item.knownPlatformMappings);
    for (const mapping of mappings.filter((item) => ['unsupported', 'unknown'].includes(item.support))) expect(mapping.limitation).toBeTruthy();
    for (const mapping of mappings.filter((item) => item.support === 'unsupported')) expect(mapping.alternative).toBeTruthy();
    for (const capability of platformCapabilities.filter((item) => item.support === 'unsupported')) expect(capability.limitation).toBeTruthy();
  });

  it('references registered platform capabilities from canonical functions and operations', () => {
    const capabilityIds = new Set(platformCapabilities.map((item) => item.id));
    for (const definition of canonicalFunctionRegistry) for (const id of definition.platformCapabilityReferences) expect(capabilityIds.has(id)).toBe(true);
    for (const mapping of applicationPacks.flatMap((item) => item.operations).flatMap((item) => item.knownPlatformMappings)) if (mapping.capabilityId) expect(capabilityIds.has(mapping.capabilityId)).toBe(true);
  });

  it('preserves existing application aliases and adds queryable knowledge aliases', () => {
    expect(resolveApplication({ service: 'HighLevel', name: 'Create contact', description: '', category: 'crm' })).toMatchObject({ id: 'gohighlevel' });
    expect(resolveApplication({ service: 'Google Drive', name: 'Create folder', description: '', category: 'action' })).toMatchObject({ id: 'google-drive' });
    expect(getApplicationPack('gdrive')).toMatchObject({ applicationId: 'google-drive' });
    expect(getApplicationPack('rest api')).toMatchObject({ applicationId: 'webhook-api' });
  });

  it('keeps packages/shared independent from packages/knowledge', () => {
    const sharedSource = resolve(process.cwd(), '..', 'shared', 'src');
    const files = readdirSync(sharedSource, { recursive: true }).filter((item): item is string => typeof item === 'string' && item.endsWith('.ts'));
    const source = files.map((file) => readFileSync(resolve(sharedSource, file), 'utf8')).join('\n');
    expect(source).not.toMatch(/@awm\/knowledge|packages[\\/]knowledge/);
  });
});
