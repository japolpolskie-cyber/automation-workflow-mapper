import type { ApplicationCapability, ApplicationCapabilityPack, CapabilityField, PlatformMapping } from '@awm/capability-sdk';
import { KNOWLEDGE_CATALOG_VERSION, type ApplicationPack, type KnowledgeFieldDefinition, type OperationDefinition, type OperationPlatformMapping } from './types.js';

const toField = (field: CapabilityField): KnowledgeFieldDefinition => ({
  key: field.key,
  label: field.label,
  dataType: field.dataType,
  required: field.required,
  description: field.description,
});
const mappingFor = (pack: ApplicationCapabilityPack, operation: ApplicationCapability, mapping: PlatformMapping): OperationPlatformMapping => {
  const limitations = mapping.limitationRefs.map((id) => pack.limitations.find((item) => item.id === id)?.detail).filter((item): item is string => Boolean(item));
  return {
    platform: mapping.platform,
    capabilityId: `${mapping.platform}.${operation.canonicalFunctionId}`,
    implementation: mapping.connector ? `${mapping.connector.app} — ${mapping.connector.eventOrOperation}` : 'Connector not verified',
    support: mapping.support,
    limitation: limitations.join(' ') || null,
    alternative: mapping.alternative,
  };
};

export function adaptCapabilityPackToKnowledge(pack: ApplicationCapabilityPack): ApplicationPack {
  const operations: ApplicationCapability[] = [...pack.triggers, ...pack.actions, ...pack.searches, ...pack.webhooks];
  return {
    applicationId: pack.application.id,
    name: pack.application.name,
    aliases: pack.application.aliases,
    category: pack.application.category,
    operations: operations.map((operation): OperationDefinition => {
      const limitations = operation.limitationRefs.map((id) => pack.limitations.find((item) => item.id === id)?.detail).filter((item): item is string => Boolean(item));
      const alternatives = operation.limitationRefs.map((id) => pack.limitations.find((item) => item.id === id)?.alternative).filter((item): item is string => Boolean(item));
      return {
        applicationId: pack.application.id,
        operationId: operation.id,
        canonicalFunctionId: operation.canonicalFunctionId,
        title: operation.title,
        purpose: operation.purpose,
        requiredInputs: operation.inputs.map(toField),
        outputs: operation.outputs.map(toField),
        acceptedInputCardinality: operation.acceptedInputCardinality,
        producedOutputCardinality: operation.producedOutputCardinality,
        batchSupported: operation.batchSupport.supported,
        commonPreviousFunctions: operation.commonPreviousFunctions,
        commonNextFunctions: operation.commonNextFunctions,
        commonMistakes: operation.commonMistakes,
        knownPlatformMappings: pack.platformMappings.filter((mapping) => mapping.operationRef === operation.id).map((mapping) => mappingFor(pack, operation, mapping)),
        limitations,
        alternatives,
        catalogVersion: KNOWLEDGE_CATALOG_VERSION,
      };
    }),
    catalogVersion: KNOWLEDGE_CATALOG_VERSION,
  };
}
