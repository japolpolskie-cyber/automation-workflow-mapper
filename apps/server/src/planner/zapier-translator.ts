import { applicationPacks, platformCapabilities, type CanonicalFunctionId } from '@awm/knowledge';
import { zapierCatalog } from '@awm/platforms';
import {
  platformTranslationResultSchema,
  type ImplementationUnit,
  type PlatformTranslationResult,
  type TranslatedImplementationEdge,
  type TranslatedImplementationNode,
  type TranslationWarning,
  type V22ConceptualGraph,
  type V22ConceptualNode,
} from '@awm/shared';
import type { PlatformTranslator } from './platform-translator.js';
import { validateZapierTranslation } from './zapier-translation-validator.js';

const roleCapability: Partial<Record<V22ConceptualNode['role'], CanonicalFunctionId>> = {
  'workflow-trigger': 'trigger', 'data-retrieval': 'data-retrieval', 'data-transformation': 'data-transformation',
  'validation-gate': 'validation', 'binary-decision': 'binary-condition', 'multi-route-decision': 'multi-route-decision',
  'parallel-split': 'multi-route-decision', 'conditional-parallel-routing': 'multi-route-decision',
  'merge-all': 'merge', 'merge-any': 'merge', 'branch-merge': 'merge',
  'human-review': 'manual-review', approval: 'human-approval', 'manual-review': 'manual-review',
  'event-wait': 'delay', 'delay-boundary': 'delay', 'resume-point': 'data-transformation',
  'collection-iterator': 'iterator', 'item-aggregator': 'aggregator', 'business-loop': 'loop',
  'loop-until': 'loop', 'technical-retry': 'retry', 'error-handler': 'error-handler',
  notification: 'notification', logging: 'logging', 'sub-workflow': 'action',
  'successful-end': 'end', 'blocked-end': 'end', 'escalation-end': 'end', 'meaningful-end': 'end',
};

interface UnitTranslation {
  node: TranslatedImplementationNode;
  unit: ImplementationUnit;
  warnings: TranslationWarning[];
}

export class ZapierConceptualTranslator implements PlatformTranslator {
  public readonly platform = 'zapier' as const;
  private sequence = 0;
  private edgeSequence = 0;

  public translate(graph: V22ConceptualGraph): PlatformTranslationResult {
    this.sequence = 0;
    this.edgeSequence = 0;
    const translated = graph.nodes.map((node) => this.translateNode(node));
    const nodes = translated.map((item) => item.node);
    const units = translated.map((item) => item.unit);
    const warnings = translated.flatMap((item) => item.warnings);
    const unitsByConcept = new Map(units.flatMap((unit) => unit.conceptualNodeIds.map((id) => [id, unit])));
    const edges: TranslatedImplementationEdge[] = graph.edges.map((edge) => ({
      id: `zapier-edge-${String(++this.edgeSequence).padStart(3, '0')}`,
      platform: 'zapier',
      source: unitsByConcept.get(edge.source)!.exitNodeId,
      target: unitsByConcept.get(edge.target)!.entryNodeId,
      label: edge.label,
      condition: edge.condition,
      conceptualEdgeIds: [edge.id],
      evidenceIds: edge.evidenceIds,
      sourceReferences: edge.sourceReferences,
    }));
    const base = {
      version: '2.3C' as const,
      shadowMode: true as const,
      selectedPlatform: 'zapier' as const,
      sourceGraphVersion: '2.2' as const,
      sourceEntryNodeId: graph.entryNodeId,
      nodes, edges, units, warnings,
    };
    const validation = validateZapierTranslation(base);
    const allWarnings = [...warnings, ...validation.warnings];
    return platformTranslationResultSchema.parse({
      ...base,
      warnings: allWarnings,
      diagnostics: {
        conceptualNodeCount: graph.nodes.length,
        translatedNodeCount: nodes.length,
        translatedEdgeCount: edges.length,
        unsupportedFeatureCount: allWarnings.filter((warning) => warning.kind === 'unsupported-feature').length,
        lossyTranslationCount: allWarnings.filter((warning) => warning.kind === 'lossy-translation').length,
        platformLeakageCount: validation.platformLeakageCount,
        invalidOperationReferenceCount: validation.invalidOperationReferenceCount,
        valid: validation.valid,
      },
    });
  }

  private translateNode(node: V22ConceptualNode): UnitTranslation {
    const warnings: TranslationWarning[] = [];
    const capability = this.capability(node);
    if (capability?.support === 'workaround') warnings.push(this.warning('ZAPIER_WORKAROUND_REQUIRED', 'platform-limitation', capability.limitation ?? `${capability.implementation} requires a composed Zapier pattern.`, node, [capability.id]));
    if (['merge-all', 'merge-any', 'branch-merge'].includes(node.role)) warnings.push(this.warning('ZAPIER_MERGE_UNSUPPORTED', 'unsupported-feature', 'Zapier Paths do not provide universal shared-branch synchronization; preserve this as a continuation boundary.', node, capability ? [capability.id] : []));
    if (node.role === 'event-wait') warnings.push(this.warning('ZAPIER_EVENT_WAIT_LIMITATION', 'platform-limitation', 'Delay Until requires a known date. An unknown external event requires a separate correlated continuation Zap.', node, capability ? [capability.id] : []));
    if (node.role === 'collection-iterator' || node.role === 'business-loop' || node.role === 'loop-until') warnings.push(this.warning('ZAPIER_LOOPING_LIMITATION', 'platform-limitation', 'Looping consumes tasks for each iteration and does not support arbitrary unbounded cycles.', node, capability ? [capability.id] : []));
    if (node.role === 'item-aggregator') warnings.push(this.warning('ZAPIER_AGGREGATION_LIMITATION', 'lossy-translation', 'Digest buffers and releases entries but is not a general array aggregation primitive.', node, capability ? [capability.id] : []));
    if (node.role === 'technical-retry') warnings.push(this.warning('ZAPIER_RETRY_LIMITATION', 'platform-limitation', 'Custom bounded retry behavior is plan-dependent and must remain explicit metadata unless supported by the selected Zap.', node, capability ? [capability.id] : []));
    if (node.role === 'error-handler') warnings.push(this.warning('ZAPIER_ERROR_PATH_LIMITATION', 'platform-limitation', 'Zapier Manager can report failures but does not represent a universal per-step recovery path.', node, capability ? [capability.id] : []));

    const operation = this.verifiedOperation(node, warnings);
    const mapping = this.mapping(node);
    if (!['canonical-terminal', 'canonical-continuation'].includes(mapping.primitiveType) && !zapierCatalog.some((item) => item.type === mapping.primitiveType)) {
      warnings.push(this.warning('ZAPIER_PRIMITIVE_UNAVAILABLE', 'unsupported-feature', `${mapping.primitiveType} is unavailable in the approved Zapier catalog.`, node, capability ? [capability.id] : []));
    }
    const implementation = this.node(node, mapping.primitiveType, mapping.label, mapping.event, mapping.primitiveType.startsWith('canonical-') ? 'canonical-boundary' : 'platform-node', {
      conceptualRole: node.role,
      collectionSource: node.collectionSource,
      wait: node.wait,
      retry: node.retry,
      terminalOutcome: node.terminalOutcome,
      ...(mapping.configuration ?? {}),
    }, capability ? [capability.id] : [], operation);
    return {
      node: implementation,
      unit: {
        id: `zapier-unit-${node.id}`,
        kind: node.role.endsWith('-end') || node.role === 'meaningful-end' ? 'terminal' : mapping.primitiveType === 'canonical-continuation' ? 'continuation' : node.role === 'technical-retry' ? 'metadata' : 'node',
        conceptualNodeIds: [node.id],
        entryNodeId: implementation.id,
        exitNodeId: implementation.id,
        implementationNodeIds: [implementation.id],
        purpose: node.purpose,
      },
      warnings,
    };
  }

  private mapping(node: V22ConceptualNode): { primitiveType: string; label: string; event: string | null; configuration?: Record<string, unknown> } {
    if (node.role === 'workflow-trigger') return { primitiveType: 'app_trigger', label: 'Zap Trigger', event: 'New or Updated Record' };
    if (node.role === 'binary-decision') return { primitiveType: 'paths', label: 'Paths by Zapier', event: 'Branch into paths', configuration: { outcomes: ['TRUE', 'FALSE'] } };
    if (node.role === 'multi-route-decision' || node.role === 'parallel-split' || node.role === 'conditional-parallel-routing') return { primitiveType: 'paths', label: 'Paths by Zapier', event: 'Branch into paths', configuration: { filteredPaths: true, pathsMayExecuteTogether: node.role !== 'multi-route-decision' } };
    if (['merge-all', 'merge-any', 'branch-merge'].includes(node.role)) return { primitiveType: 'canonical-continuation', label: 'Shared Continuation Review', event: null, configuration: { requestedMergeRole: node.role } };
    if (['human-review', 'approval', 'manual-review'].includes(node.role)) return { primitiveType: 'approval', label: 'Request Approval', event: 'Request Approval', configuration: { responseHandledBy: 'following-continuation' } };
    if (node.role === 'event-wait') return { primitiveType: 'canonical-continuation', label: 'Correlated Continuation Zap', event: null, configuration: { correlationIdentifier: node.wait?.correlationIdentifier, resumeCondition: node.wait?.resumeCondition, timeoutPolicy: node.wait?.timeoutPolicy } };
    if (node.role === 'delay-boundary') return { primitiveType: 'delay', label: 'Delay by Zapier', event: node.wait?.resumeCondition ? 'Delay Until' : 'Delay For', configuration: { resumeCondition: node.wait?.resumeCondition, timeoutPolicy: node.wait?.timeoutPolicy } };
    if (node.role === 'resume-point') return { primitiveType: 'formatter', label: 'Resume Data Boundary', event: 'Utilities', configuration: { boundary: 'resume' } };
    if (node.role === 'collection-iterator') return { primitiveType: 'looping', label: 'Looping by Zapier', event: 'Create Loop From Line Items', configuration: { collectionSource: node.collectionSource } };
    if (node.role === 'item-aggregator') return { primitiveType: 'digest', label: 'Digest by Zapier', event: 'Append Entry and Schedule Digest' };
    if (node.role === 'business-loop' || node.role === 'loop-until') return { primitiveType: 'looping', label: 'Bounded Looping by Zapier', event: 'Create Loop From Numbers', configuration: { boundedCycle: true } };
    if (node.role === 'technical-retry') return { primitiveType: 'canonical-continuation', label: 'Bounded Retry Policy', event: null, configuration: { retry: node.retry, requiresSupportedReplay: true } };
    if (node.role === 'error-handler') return { primitiveType: 'error', label: 'Zapier Manager Failure Notification', event: 'Notify on Zap Error', configuration: { recoveryPathUnsupported: true } };
    if (node.role === 'sub-workflow') return { primitiveType: 'sub_zap', label: 'Sub-Zap', event: 'Call a Sub-Zap', configuration: { explicitInputOutputContract: true } };
    if (node.role.endsWith('-end') || node.role === 'meaningful-end') return { primitiveType: 'canonical-terminal', label: node.terminalOutcome ?? node.title, event: null };
    if (node.role === 'validation-gate') return { primitiveType: 'filter', label: 'Filter by Zapier', event: 'Only continue if' };
    if (node.role === 'notification') return { primitiveType: 'notification', label: 'Notification Action', event: 'Send Message' };
    if (node.role === 'logging') return { primitiveType: 'storage', label: 'Storage by Zapier', event: 'Set Value' };
    if (node.role === 'data-retrieval') return { primitiveType: 'app_action', label: 'Find Record Action', event: 'Find Record' };
    if (node.role === 'data-transformation') return this.capabilityOperationMapping(node);
    return { primitiveType: 'formatter', label: 'Formatter by Zapier', event: 'Utilities' };
  }

  private capabilityOperationMapping(node: V22ConceptualNode) {
    const operations = node.underlyingOperations.map((item) => item.toLowerCase());
    if (operations.some((item) => /notif|send|email|message/.test(item))) return { primitiveType: 'notification', label: 'Notification Action', event: 'Send Message' };
    if (operations.some((item) => /retriev|search|find|get/.test(item))) return { primitiveType: 'app_action', label: 'Find Record Action', event: 'Find Record' };
    if (operations.some((item) => /create/.test(item))) return { primitiveType: 'app_action', label: 'Create Record Action', event: 'Create Record' };
    if (operations.some((item) => /update|save/.test(item))) return { primitiveType: 'app_action', label: 'Update Record Action', event: 'Update Record' };
    return { primitiveType: 'formatter', label: 'Formatter by Zapier', event: 'Utilities', configuration: { unresolvedApplicationOperation: true } };
  }

  private node(node: V22ConceptualNode, primitiveType: string, label: string, event: string | null, primitiveKind: TranslatedImplementationNode['primitiveKind'], configuration: Record<string, unknown>, capabilityRefs: string[], operation: { applicationId: string; operationId: string } | null): TranslatedImplementationNode {
    return {
      id: `zapier-node-${String(++this.sequence).padStart(3, '0')}`, platform: 'zapier', primitiveKind, primitiveType, label, event,
      conceptualNodeIds: [node.id], capabilityGroupIds: node.capabilityGroupIds, capabilityRefs,
      applicationId: operation?.applicationId ?? null, operationId: operation?.operationId ?? null,
      configuration, evidenceIds: node.evidenceIds, sourceReferences: node.sourceReferences,
      lifecycleStage: node.lifecycleStage, underlyingOperations: node.underlyingOperations, confidence: node.confidence,
    };
  }

  private verifiedOperation(node: V22ConceptualNode, warnings: TranslationWarning[]): { applicationId: string; operationId: string } | null {
    for (const value of node.underlyingOperations) {
      const match = /^([a-z0-9-]+)\.([a-z0-9-]+)$/i.exec(value);
      if (!match) continue;
      const pack = applicationPacks.find((item) => item.applicationId === match[1]);
      const operation = pack?.operations.find((item) => item.operationId === match[2]);
      const mapping = operation?.knownPlatformMappings.find((item) => item.platform === 'zapier');
      if (!operation || !mapping || mapping.support === 'unsupported' || mapping.support === 'unknown') {
        warnings.push(this.warning('ZAPIER_OPERATION_UNAVAILABLE', 'unsupported-feature', `${value} has no verified Zapier implementation and was not invented.`, node, []));
        return null;
      }
      if (mapping.support === 'workaround') warnings.push(this.warning('ZAPIER_OPERATION_WORKAROUND', 'platform-limitation', mapping.limitation ?? `${value} requires a workaround.`, node, mapping.capabilityId ? [mapping.capabilityId] : []));
      return { applicationId: operation.applicationId, operationId: operation.operationId };
    }
    return null;
  }

  private capability(node: V22ConceptualNode) {
    const functionId = roleCapability[node.role];
    return functionId ? platformCapabilities.find((item) => item.platform === 'zapier' && item.canonicalFunctionId === functionId) : undefined;
  }

  private warning(code: string, kind: TranslationWarning['kind'], message: string, node: V22ConceptualNode, capabilityRefs: string[]): TranslationWarning {
    return { code, severity: 'warning', kind, message, conceptualNodeIds: [node.id], capabilityRefs };
  }
}
