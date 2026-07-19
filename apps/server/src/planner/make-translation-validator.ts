import { getOperation } from '@awm/knowledge';
import { makeCatalog } from '@awm/platforms';
import type { PlatformTranslationResult, TranslationWarning } from '@awm/shared';

const n8nLeakage = /\b(?:n8n\s+if|if node|n8n\s+merge|merge node|execute workflow|loop over items)\b/i;
const zapierLeakage = /\b(?:paths by zapier|zapier paths|digest by zapier|zapier digest|storage by zapier|sub-?zap)\b/i;

export interface MakeTranslationValidation {
  warnings: TranslationWarning[];
  platformLeakageCount: number;
  invalidOperationReferenceCount: number;
  valid: boolean;
}

export function validateMakeTranslation(result: Omit<PlatformTranslationResult, 'diagnostics'>): MakeTranslationValidation {
  const warnings: TranslationWarning[] = [];
  const allowed = new Set([...makeCatalog.map((item) => item.type), 'canonical-terminal', 'canonical-continuation']);
  let platformLeakageCount = 0;
  let invalidOperationReferenceCount = 0;

  for (const node of result.nodes) {
    if (node.platform !== 'make' || !allowed.has(node.primitiveType)) {
      platformLeakageCount += 1;
      warnings.push(issue('MAKE_UNKNOWN_PRIMITIVE', 'unsupported-feature', `${node.primitiveType} is not present in the approved Make catalog.`, node));
    }
    const platformText = `${node.primitiveType} ${node.label} ${node.event ?? ''}`;
    if (n8nLeakage.test(platformText) || zapierLeakage.test(platformText)) {
      platformLeakageCount += 1;
      warnings.push(issue('MAKE_PLATFORM_LEAKAGE', 'unsupported-feature', `${node.label} contains terminology from another automation platform.`, node));
    }
    if (node.applicationId || node.operationId) {
      const operation = node.applicationId && node.operationId ? getOperation(node.applicationId, node.operationId) : undefined;
      const mapping = operation?.knownPlatformMappings.find((item) => item.platform === 'make');
      if (!operation || !mapping || mapping.support === 'unsupported' || mapping.support === 'unknown') {
        invalidOperationReferenceCount += 1;
        warnings.push(issue('MAKE_INVALID_OPERATION_REFERENCE', 'unsupported-feature', `${node.applicationId ?? 'unknown'}.${node.operationId ?? 'unknown'} is not a verified Make operation mapping.`, node));
      }
    }
    if (!node.sourceReferences.length || !node.conceptualNodeIds.length) {
      warnings.push(issue('MAKE_TRACEABILITY_MISSING', 'lossy-translation', `${node.label} does not preserve conceptual traceability.`, node));
    }
  }

  return {
    warnings,
    platformLeakageCount,
    invalidOperationReferenceCount,
    valid: !warnings.some((warning) => warning.severity === 'error'),
  };
}

function issue(code: string, kind: TranslationWarning['kind'], message: string, node: PlatformTranslationResult['nodes'][number]): TranslationWarning {
  return { code, severity: 'error', kind, message, conceptualNodeIds: node.conceptualNodeIds, capabilityRefs: node.capabilityRefs };
}
