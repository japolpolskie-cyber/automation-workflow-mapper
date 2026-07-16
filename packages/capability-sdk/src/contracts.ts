import type { DataCardinality, Platform } from '@awm/shared';

export const CAPABILITY_SDK_SCHEMA_VERSION = '1.0' as const;
export const capabilityCanonicalFunctionIds = [
  'trigger', 'action', 'data-retrieval', 'data-transformation', 'validation', 'filter',
  'binary-condition', 'multi-route-decision', 'iterator', 'loop', 'merge', 'aggregator',
  'delay', 'human-approval', 'retry', 'error-handler', 'notification', 'logging',
  'manual-review', 'end',
] as const;

export type CapabilityCanonicalFunctionId = typeof capabilityCanonicalFunctionIds[number];
export type CapabilityOperationKind = 'trigger' | 'action' | 'search' | 'webhook';
export type CapabilityDataType = 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'unknown';
export type CapabilitySupportLevel = 'native' | 'workaround' | 'unsupported' | 'unknown';
export type CapabilityVerificationState = 'verified' | 'unverified' | 'deprecated';

export interface CapabilityField {
  key: string; label: string; dataType: CapabilityDataType; required: boolean; nullable: boolean;
  description: string; cardinality: DataCardinality; sensitive: boolean;
}
export interface BatchSupport {
  supported: boolean; maximumItems: number | null;
  behavior: 'single_request' | 'platform_items' | 'iterator_required' | 'unknown';
}
export interface CapabilityLifecycle { status: 'active' | 'deprecated'; replacedBy: string | null }
export interface CapabilityBase {
  id: string; kind: CapabilityOperationKind; title: string; purpose: string; canonicalFunctionId: CapabilityCanonicalFunctionId;
  inputs: CapabilityField[]; outputs: CapabilityField[]; acceptedInputCardinality: DataCardinality[];
  producedOutputCardinality: DataCardinality; batchSupport: BatchSupport; prerequisiteOperationIds: string[];
  limitationRefs: string[]; documentationRefs: string[]; commonPreviousFunctions: CapabilityCanonicalFunctionId[];
  commonNextFunctions: CapabilityCanonicalFunctionId[]; commonMistakes: string[]; lifecycle: CapabilityLifecycle;
}
export interface TriggerCapability extends CapabilityBase { kind: 'trigger'; delivery: 'instant' | 'polling' | 'scheduled' | 'unknown'; deduplicationKey: string | null }
export interface ActionCapability extends CapabilityBase { kind: 'action'; idempotency: 'native' | 'caller_required' | 'not_supported' | 'unknown'; sideEffect: true }
export interface SearchCapability extends CapabilityBase { kind: 'search'; resultMode: 'zero_or_one' | 'collection' | 'paginated_collection'; pagination: { mode: 'cursor' | 'page' | 'offset' | 'unknown'; maximumPageSize: number | null } | null }
export interface WebhookCapability extends CapabilityBase { kind: 'webhook'; direction: 'inbound' | 'outbound'; verification: 'signature' | 'token' | 'none' | 'unknown'; eventType: string }
export type ApplicationCapability = TriggerCapability | ActionCapability | SearchCapability | WebhookCapability;
export interface ApplicationIdentity { id: string; name: string; aliases: string[]; category: string; iconKey: string; website: string | null }
export interface AuthenticationDefinition { id: string; type: 'oauth2' | 'access_token' | 'api_key' | 'basic' | 'custom' | 'none' | 'unknown'; scopes: string[]; description: string; documentationRefs: string[] }
export interface ApplicationLimitation { id: string; severity: 'info' | 'warning' | 'blocking'; scope: 'application' | 'authentication' | 'operation' | 'platform'; summary: string; detail: string; alternative: string | null; documentationRefs: string[] }
export interface DocumentationEntry { id: string; title: string; summary: string; url: string | null; source: 'official' | 'platform' | 'internal_verified'; lastVerifiedAt: string | null }
export interface DocumentationBundle { overview: DocumentationEntry; authentication: DocumentationEntry[]; operations: DocumentationEntry[]; rateLimits: DocumentationEntry[]; pagination: DocumentationEntry[]; webhooks: DocumentationEntry[]; errorHandling: DocumentationEntry[] }
export interface PlatformMapping {
  operationRef: string; platform: Platform; support: CapabilitySupportLevel;
  connector: { app: string; component: string; eventOrOperation: string } | null; credentialType: string | null;
  limitationRefs: string[]; alternative: string | null;
  evidence: { verification: CapabilityVerificationState; sourceType: 'official_documentation' | 'connector_catalog' | 'manual_test'; sourceUrl: string | null; verifiedAt: string | null; connectorVersion: string | null };
}
export interface ApplicationCapabilityPack {
  schemaVersion: typeof CAPABILITY_SDK_SCHEMA_VERSION; packId: string; packVersion: string; catalogCompatibility: string;
  application: ApplicationIdentity; authentication: AuthenticationDefinition[]; triggers: TriggerCapability[];
  actions: ActionCapability[]; searches: SearchCapability[]; webhooks: WebhookCapability[];
  limitations: ApplicationLimitation[]; documentation: DocumentationBundle; platformMappings: PlatformMapping[];
  provenance: { maintainer: string; license: string; sourceRepository: string | null; reviewedAt: string; contentHash: string };
}
export interface CapabilityQuery {
  applicationIds?: string[]; kinds?: CapabilityOperationKind[]; canonicalFunctionIds?: CapabilityCanonicalFunctionId[];
  platform?: Platform; support?: CapabilitySupportLevel[]; inputCardinality?: DataCardinality;
  outputCardinality?: DataCardinality; limit: number;
}
export interface CapabilityMatch { application: ApplicationIdentity; operation: ApplicationCapability; platformMapping: PlatformMapping | null }
