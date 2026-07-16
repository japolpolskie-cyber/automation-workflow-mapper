import type { DataCardinality, Platform } from '@awm/shared';

export const KNOWLEDGE_CATALOG_VERSION = '1.0.0' as const;

export const canonicalFunctionIds = [
  'trigger', 'action', 'data-retrieval', 'data-transformation', 'validation', 'filter',
  'binary-condition', 'multi-route-decision', 'iterator', 'loop', 'merge', 'aggregator',
  'delay', 'human-approval', 'retry', 'error-handler', 'notification', 'logging',
  'manual-review', 'end'
] as const;

export type CanonicalFunctionId = typeof canonicalFunctionIds[number];
export type KnowledgeDataType = 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'unknown';

export interface KnowledgeFieldDefinition {
  key: string;
  label: string;
  dataType: KnowledgeDataType;
  required: boolean;
  description: string;
}

export interface CompatibilityRule {
  id: string;
  kind: 'requires_cardinality' | 'forbids_cardinality' | 'requires_outcomes' | 'requires_boundary' | 'requires_incoming_branches' | 'unmatched_behavior' | 'semantic';
  value: string;
  message: string;
}

export interface CanonicalFunctionDefinition {
  id: CanonicalFunctionId;
  canonicalType: CanonicalFunctionId;
  purpose: string;
  useWhen: string[];
  doNotUseWhen: string[];
  requiredInputs: KnowledgeFieldDefinition[];
  outputs: KnowledgeFieldDefinition[];
  acceptedCardinality: DataCardinality[];
  compatibilityRules: CompatibilityRule[];
  commonPreviousFunctions: CanonicalFunctionId[];
  commonNextFunctions: CanonicalFunctionId[];
  commonMistakes: string[];
  platformCapabilityReferences: string[];
  catalogVersion: typeof KNOWLEDGE_CATALOG_VERSION;
}

export interface PlatformCapabilityDefinition {
  id: string;
  platform: Platform;
  canonicalFunctionId: CanonicalFunctionId;
  implementation: string;
  support: 'native' | 'workaround' | 'unsupported';
  limitation: string | null;
  alternative: string | null;
  catalogVersion: typeof KNOWLEDGE_CATALOG_VERSION;
}

export interface OperationPlatformMapping {
  platform: Platform;
  capabilityId: string | null;
  implementation: string;
  support: 'native' | 'workaround' | 'unsupported' | 'unknown';
  limitation: string | null;
  alternative: string | null;
}

export interface OperationDefinition {
  applicationId: string;
  operationId: string;
  canonicalFunctionId: CanonicalFunctionId;
  title: string;
  purpose: string;
  requiredInputs: KnowledgeFieldDefinition[];
  outputs: KnowledgeFieldDefinition[];
  acceptedInputCardinality: DataCardinality[];
  producedOutputCardinality: DataCardinality;
  batchSupported: boolean;
  commonPreviousFunctions: CanonicalFunctionId[];
  commonNextFunctions: CanonicalFunctionId[];
  commonMistakes: string[];
  knownPlatformMappings: OperationPlatformMapping[];
  limitations: string[];
  alternatives: string[];
  catalogVersion: typeof KNOWLEDGE_CATALOG_VERSION;
}

export interface ApplicationPack {
  applicationId: string;
  name: string;
  aliases: string[];
  category: string;
  operations: OperationDefinition[];
  catalogVersion: typeof KNOWLEDGE_CATALOG_VERSION;
}

export interface KnowledgeCatalog {
  version: typeof KNOWLEDGE_CATALOG_VERSION;
  canonicalFunctions: readonly CanonicalFunctionDefinition[];
  applications: readonly ApplicationPack[];
  platformCapabilities: readonly PlatformCapabilityDefinition[];
  getCanonicalFunction(id: CanonicalFunctionId): CanonicalFunctionDefinition | undefined;
  getApplication(applicationIdOrAlias: string): ApplicationPack | undefined;
  getOperation(applicationIdOrAlias: string, operationId: string): OperationDefinition | undefined;
}

export const field = (key: string, label: string, dataType: KnowledgeDataType, required: boolean, description: string): KnowledgeFieldDefinition => ({ key, label, dataType, required, description });
