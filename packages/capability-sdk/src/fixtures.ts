import type { ApplicationCapabilityPack } from './contracts.js';
const documentation = { id: 'fixture-overview', title: 'Fixture documentation', summary: 'Compatibility-only fixture.', url: 'https://example.com/fixture', source: 'internal_verified' as const, lastVerifiedAt: '2026-07-17' };
export const compatibilityCapabilityPackFixture: ApplicationCapabilityPack = {
  schemaVersion: '1.0', packId: 'com.example.fixture', packVersion: '1.0.0', catalogCompatibility: '^1.0.0',
  application: { id: 'fixture-app', name: 'Fixture App', aliases: ['fixture'], category: 'testing', iconKey: 'fixture', website: 'https://example.com' },
  authentication: [],
  triggers: [{
    id: 'record-created', kind: 'trigger', title: 'Record Created', purpose: 'Starts when a record is created.', canonicalFunctionId: 'trigger',
    inputs: [], outputs: [{ key: 'record', label: 'Record', dataType: 'object', required: true, nullable: false, description: 'Created record.', cardinality: 'single', sensitive: false }],
    acceptedInputCardinality: ['single'], producedOutputCardinality: 'single', batchSupport: { supported: false, maximumItems: null, behavior: 'iterator_required' },
    prerequisiteOperationIds: [], limitationRefs: [], documentationRefs: ['fixture-overview'], commonPreviousFunctions: [], commonNextFunctions: ['action'], commonMistakes: [], lifecycle: { status: 'active', replacedBy: null },
    delivery: 'instant', deduplicationKey: 'record.id',
  }],
  actions: [], searches: [], webhooks: [], limitations: [],
  documentation: { overview: documentation, authentication: [], operations: [], rateLimits: [], pagination: [], webhooks: [], errorHandling: [] },
  platformMappings: [],
  provenance: { maintainer: 'AWM test suite', license: 'Internal', sourceRepository: null, reviewedAt: '2026-07-17', contentHash: 'fixture-v1' },
};
