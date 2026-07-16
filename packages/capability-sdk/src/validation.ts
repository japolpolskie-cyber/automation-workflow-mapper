import type { ApplicationCapability, ApplicationCapabilityPack } from './contracts.js';
import { applicationCapabilityPackSchema } from './schemas.js';

export interface CapabilityValidationIssue { code: string; path: string; message: string }
export interface CapabilityValidationResult { valid: boolean; issues: CapabilityValidationIssue[] }
const operations = (pack: ApplicationCapabilityPack): ApplicationCapability[] => [...pack.triggers, ...pack.actions, ...pack.searches, ...pack.webhooks];
const duplicates = (values: string[]): string[] => values.filter((value, index) => values.indexOf(value) !== index);

export function validateApplicationCapabilityPack(input: unknown): CapabilityValidationResult {
  const parsed = applicationCapabilityPackSchema.safeParse(input);
  if (!parsed.success) return { valid: false, issues: parsed.error.issues.map((issue) => ({ code: 'SCHEMA_INVALID', path: issue.path.join('.'), message: issue.message })) };
  const pack = parsed.data as ApplicationCapabilityPack;
  const issues: CapabilityValidationIssue[] = [];
  const allOperations = operations(pack);
  for (const id of new Set(duplicates(allOperations.map((operation) => operation.id)))) issues.push({ code: 'OPERATION_ID_DUPLICATE', path: 'operations', message: `Operation ID "${id}" is duplicated.` });
  for (const id of new Set(duplicates(pack.limitations.map((limitation) => limitation.id)))) issues.push({ code: 'LIMITATION_ID_DUPLICATE', path: 'limitations', message: `Limitation ID "${id}" is duplicated.` });
  const documentation = [pack.documentation.overview, ...pack.documentation.authentication, ...pack.documentation.operations, ...pack.documentation.rateLimits, ...pack.documentation.pagination, ...pack.documentation.webhooks, ...pack.documentation.errorHandling];
  for (const id of new Set(duplicates(documentation.map((entry) => entry.id)))) issues.push({ code: 'DOCUMENTATION_ID_DUPLICATE', path: 'documentation', message: `Documentation ID "${id}" is duplicated.` });
  const operationIds = new Set(allOperations.map((operation) => operation.id));
  const limitationIds = new Set(pack.limitations.map((limitation) => limitation.id));
  const documentationIds = new Set(documentation.map((entry) => entry.id));
  for (const operation of allOperations) {
    if (operation.batchSupport.supported && !operation.acceptedInputCardinality.includes('collection')) issues.push({ code: 'BATCH_CARDINALITY_CONFLICT', path: `operations.${operation.id}.batchSupport`, message: 'Batch support requires collection input cardinality.' });
    if (!operation.batchSupport.supported && operation.batchSupport.behavior === 'single_request') issues.push({ code: 'BATCH_BEHAVIOR_CONFLICT', path: `operations.${operation.id}.batchSupport`, message: 'A non-batch operation cannot declare single-request batch behavior.' });
    for (const id of operation.limitationRefs.filter((id) => !limitationIds.has(id))) issues.push({ code: 'LIMITATION_REFERENCE_INVALID', path: `operations.${operation.id}.limitationRefs`, message: `Unknown limitation "${id}".` });
    for (const id of operation.documentationRefs.filter((id) => !documentationIds.has(id))) issues.push({ code: 'DOCUMENTATION_REFERENCE_INVALID', path: `operations.${operation.id}.documentationRefs`, message: `Unknown documentation "${id}".` });
    for (const id of operation.prerequisiteOperationIds.filter((id) => !operationIds.has(id))) issues.push({ code: 'PREREQUISITE_INVALID', path: `operations.${operation.id}.prerequisiteOperationIds`, message: `Unknown prerequisite operation "${id}".` });
  }
  for (const mapping of pack.platformMappings) {
    if (!operationIds.has(mapping.operationRef)) issues.push({ code: 'MAPPING_OPERATION_INVALID', path: `platformMappings.${mapping.operationRef}`, message: 'Platform mapping references an unknown operation.' });
    for (const id of mapping.limitationRefs.filter((id) => !limitationIds.has(id))) issues.push({ code: 'MAPPING_LIMITATION_INVALID', path: `platformMappings.${mapping.operationRef}.limitationRefs`, message: `Unknown limitation "${id}".` });
    if (['unsupported', 'unknown'].includes(mapping.support) && mapping.limitationRefs.length === 0) issues.push({ code: 'MAPPING_LIMITATION_REQUIRED', path: `platformMappings.${mapping.operationRef}.limitationRefs`, message: `${mapping.support} support requires an explicit limitation.` });
    if (mapping.support === 'unsupported' && !mapping.alternative) issues.push({ code: 'MAPPING_ALTERNATIVE_REQUIRED', path: `platformMappings.${mapping.operationRef}.alternative`, message: 'Unsupported mappings require an alternative.' });
    if (mapping.support === 'native' && (mapping.evidence.verification !== 'verified' || !mapping.evidence.verifiedAt || !mapping.evidence.sourceUrl)) issues.push({ code: 'NATIVE_EVIDENCE_REQUIRED', path: `platformMappings.${mapping.operationRef}.evidence`, message: 'Native support requires verified, dated source evidence.' });
    if (mapping.support === 'unknown' && mapping.evidence.verification !== 'unverified') issues.push({ code: 'UNKNOWN_MUST_BE_UNVERIFIED', path: `platformMappings.${mapping.operationRef}.evidence`, message: 'Unknown support must remain unverified.' });
  }
  return { valid: issues.length === 0, issues };
}

export class CapabilityPackValidationError extends Error {
  public constructor(public readonly issues: CapabilityValidationIssue[]) { super(`Capability pack validation failed with ${issues.length} issue(s).`); }
}
