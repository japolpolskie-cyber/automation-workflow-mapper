import { getOperation } from '@awm/knowledge';
import { n8nCatalog } from '@awm/platforms';
import type { PlatformTranslationResult, TranslationWarning } from '@awm/shared';

const makeLeakage = /\b(?:make(?:\.com)?\s+(?:router|module)|router module|scenario module)\b/i;
const zapierLeakage = /\b(?:paths by zapier|digest by zapier|sub-?zap|zapier paths|zapier digest)\b/i;

export interface N8nTranslationValidation {
  warnings: TranslationWarning[];
  platformLeakageCount: number;
  invalidOperationReferenceCount: number;
  valid: boolean;
}

export function validateN8nTranslation(result: Omit<PlatformTranslationResult, 'diagnostics'>): N8nTranslationValidation {
  const warnings: TranslationWarning[] = [];
  const allowed = new Set([...n8nCatalog.map((item) => item.type), 'canonical-terminal']);
  let platformLeakageCount = 0;
  let invalidOperationReferenceCount = 0;

  for (const node of result.nodes) {
    if (node.platform !== 'n8n' || !allowed.has(node.primitiveType)) {
      platformLeakageCount += 1;
      warnings.push({
        code: 'N8N_UNKNOWN_PRIMITIVE',
        severity: 'error',
        kind: 'unsupported-feature',
        message: `${node.primitiveType} is not present in the approved n8n catalog.`,
        conceptualNodeIds: node.conceptualNodeIds,
        capabilityRefs: node.capabilityRefs,
      });
    }
    const platformText = `${node.primitiveType} ${node.label} ${node.event ?? ''}`;
    if (makeLeakage.test(platformText) || zapierLeakage.test(platformText)) {
      platformLeakageCount += 1;
      warnings.push({
        code: 'N8N_PLATFORM_LEAKAGE',
        severity: 'error',
        kind: 'unsupported-feature',
        message: `${node.label} contains terminology from a different automation platform.`,
        conceptualNodeIds: node.conceptualNodeIds,
        capabilityRefs: node.capabilityRefs,
      });
    }
    if (node.applicationId || node.operationId) {
      const operation = node.applicationId && node.operationId ? getOperation(node.applicationId, node.operationId) : undefined;
      const mapping = operation?.knownPlatformMappings.find((item) => item.platform === 'n8n');
      if (!operation || !mapping || mapping.support === 'unsupported' || mapping.support === 'unknown') {
        invalidOperationReferenceCount += 1;
        warnings.push({
          code: 'N8N_INVALID_OPERATION_REFERENCE',
          severity: 'error',
          kind: 'unsupported-feature',
          message: `${node.applicationId ?? 'unknown'}.${node.operationId ?? 'unknown'} is not a verified n8n operation mapping.`,
          conceptualNodeIds: node.conceptualNodeIds,
          capabilityRefs: node.capabilityRefs,
        });
      }
    }
    if (!node.sourceReferences.length || !node.conceptualNodeIds.length) {
      warnings.push({
        code: 'N8N_TRACEABILITY_MISSING',
        severity: 'error',
        kind: 'lossy-translation',
        message: `${node.label} does not preserve its conceptual source references.`,
        conceptualNodeIds: node.conceptualNodeIds,
        capabilityRefs: node.capabilityRefs,
      });
    }
  }

  return {
    warnings,
    platformLeakageCount,
    invalidOperationReferenceCount,
    valid: !warnings.some((warning) => warning.severity === 'error'),
  };
}
