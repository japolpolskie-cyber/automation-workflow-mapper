import { getOperation } from '@awm/knowledge';
import { zapierCatalog } from '@awm/platforms';
import type { PlatformTranslationResult, TranslationWarning } from '@awm/shared';

const foreignTerminology = /\b(?:IF|Switch|Merge|Router|Iterator|Aggregate|Execute Workflow|Loop Over Items|n8n|Make(?:\.com)?\s+module|trigger module|action module|array aggregator)\b/i;

export interface ZapierTranslationValidation {
  warnings: TranslationWarning[];
  platformLeakageCount: number;
  invalidOperationReferenceCount: number;
  valid: boolean;
}

export function validateZapierTranslation(result: Omit<PlatformTranslationResult, 'diagnostics'>): ZapierTranslationValidation {
  const warnings: TranslationWarning[] = [];
  const allowed = new Set([...zapierCatalog.map((item) => item.type), 'canonical-terminal', 'canonical-continuation']);
  let platformLeakageCount = 0;
  let invalidOperationReferenceCount = 0;

  for (const node of result.nodes) {
    if (node.platform !== 'zapier' || !allowed.has(node.primitiveType)) {
      platformLeakageCount += 1;
      warnings.push(issue('ZAPIER_UNKNOWN_PRIMITIVE', 'unsupported-feature', `${node.primitiveType} is not present in the approved Zapier catalog.`, node));
    }
    if (foreignTerminology.test(`${node.primitiveType} ${node.label} ${node.event ?? ''}`)) {
      platformLeakageCount += 1;
      warnings.push(issue('ZAPIER_PLATFORM_LEAKAGE', 'unsupported-feature', `${node.label} contains terminology from another automation platform.`, node));
    }
    if (node.applicationId || node.operationId) {
      const operation = node.applicationId && node.operationId ? getOperation(node.applicationId, node.operationId) : undefined;
      const mapping = operation?.knownPlatformMappings.find((item) => item.platform === 'zapier');
      if (!operation || !mapping || mapping.support === 'unsupported' || mapping.support === 'unknown') {
        invalidOperationReferenceCount += 1;
        warnings.push(issue('ZAPIER_INVALID_OPERATION_REFERENCE', 'unsupported-feature', `${node.applicationId ?? 'unknown'}.${node.operationId ?? 'unknown'} is not a verified Zapier operation mapping.`, node));
      }
    }
    if (!node.sourceReferences.length || !node.conceptualNodeIds.length) {
      warnings.push(issue('ZAPIER_TRACEABILITY_MISSING', 'lossy-translation', `${node.label} does not preserve conceptual traceability.`, node));
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
