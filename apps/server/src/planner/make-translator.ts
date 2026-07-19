import { applicationPacks, platformCapabilities, type CanonicalFunctionId } from '@awm/knowledge';
import { makeCatalog } from '@awm/platforms';
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
import { validateMakeTranslation } from './make-translation-validator.js';
import type { PlatformTranslator } from './platform-translator.js';

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

export class MakeConceptualTranslator implements PlatformTranslator {
  public readonly platform = 'make' as const;
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
      id: `make-edge-${String(++this.edgeSequence).padStart(3, '0')}`,
      platform: 'make',
      source: unitsByConcept.get(edge.source)!.exitNodeId,
      target: unitsByConcept.get(edge.target)!.entryNodeId,
      label: edge.label,
      condition: edge.condition,
      conceptualEdgeIds: [edge.id],
      evidenceIds: edge.evidenceIds,
      sourceReferences: edge.sourceReferences,
    }));
    const base = {
      version: '2.3B' as const,
      shadowMode: true as const,
      selectedPlatform: 'make' as const,
      sourceGraphVersion: '2.2' as const,
      sourceEntryNodeId: graph.entryNodeId,
      nodes, edges, units, warnings,
    };
    const validation = validateMakeTranslation(base);
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
    if (capability?.support === 'workaround') warnings.push(this.warning('MAKE_WORKAROUND_REQUIRED', 'platform-limitation', capability.limitation ?? `${capability.implementation} requires a composed Make pattern.`, node, [capability.id]));
    if (['merge-all', 'merge-any', 'branch-merge'].includes(node.role)) warnings.push(this.warning('MAKE_SYNCHRONIZATION_LIMITATION', 'lossy-translation', 'Make Routers do not provide a universal branch synchronization primitive; preserve this as a continuation boundary and review the scenario design.', node, capability ? [capability.id] : []));
    if (node.role === 'event-wait') warnings.push(this.warning('MAKE_EVENT_CONTINUATION_REQUIRED', 'platform-limitation', 'Long-running event correlation should resume through a correlated webhook or state-based continuation rather than an invented wait module.', node, capability ? [capability.id] : []));

    const operation = this.verifiedOperation(node, warnings);
    const mapping = this.mapping(node);
    if (!['canonical-terminal', 'canonical-continuation'].includes(mapping.primitiveType) && !makeCatalog.some((item) => item.type === mapping.primitiveType)) {
      warnings.push(this.warning('MAKE_PRIMITIVE_UNAVAILABLE', 'unsupported-feature', `${mapping.primitiveType} is unavailable in the approved Make catalog.`, node, capability ? [capability.id] : []));
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
        id: `make-unit-${node.id}`,
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
    if (node.role === 'workflow-trigger') return { primitiveType: 'trigger_module', label: 'Make Trigger Module', event: 'Watch events' };
    if (node.role === 'binary-decision') return { primitiveType: 'filter', label: 'Mutually Exclusive Route Filters', event: 'Filter bundle', configuration: { outcomes: ['TRUE', 'FALSE'], requiresRouterWhenBothRoutesContinue: true } };
    if (node.role === 'multi-route-decision') return { primitiveType: 'router', label: 'Router with Route Filters', event: 'Router', configuration: { filteredRoutes: true } };
    if (node.role === 'parallel-split') return { primitiveType: 'router', label: 'Router', event: 'Router', configuration: { parallelRoutes: true } };
    if (node.role === 'conditional-parallel-routing') return { primitiveType: 'router', label: 'Router with Conditional Routes', event: 'Router', configuration: { filteredRoutes: true, routesMayExecuteTogether: true } };
    if (['merge-all', 'merge-any', 'branch-merge'].includes(node.role)) return { primitiveType: 'canonical-continuation', label: 'Synchronization Review Boundary', event: null, configuration: { requestedMergeRole: node.role } };
    if (['human-review', 'approval', 'manual-review'].includes(node.role)) return { primitiveType: 'approval', label: 'Create Approval Request', event: 'Create approval request', configuration: { responseHandledBy: 'following-event-continuation' } };
    if (node.role === 'event-wait') return { primitiveType: 'canonical-continuation', label: 'Correlated Event Continuation', event: null, configuration: { correlationIdentifier: node.wait?.correlationIdentifier, resumeCondition: node.wait?.resumeCondition, timeoutPolicy: node.wait?.timeoutPolicy } };
    if (node.role === 'delay-boundary') return { primitiveType: 'sleep', label: 'Sleep', event: 'Sleep', configuration: { resumeCondition: node.wait?.resumeCondition, timeoutPolicy: node.wait?.timeoutPolicy } };
    if (node.role === 'resume-point') return { primitiveType: 'tools', label: 'Resume Data Boundary', event: 'Set variable', configuration: { boundary: 'resume' } };
    if (node.role === 'collection-iterator') return { primitiveType: 'iterator', label: 'Iterator', event: 'Iterator', configuration: { collectionSource: node.collectionSource } };
    if (node.role === 'item-aggregator') return { primitiveType: 'array_aggregator', label: 'Array Aggregator', event: 'Aggregate bundles into an array' };
    if (node.role === 'business-loop' || node.role === 'loop-until') return { primitiveType: 'repeater', label: 'Bounded Repeater', event: 'Repeat a configured number of times', configuration: { boundedCycle: true } };
    if (node.role === 'technical-retry') return { primitiveType: 'error_handler', label: 'Retry Error Handler Route', event: 'Resume', configuration: { retry: node.retry, bounded: true } };
    if (node.role === 'error-handler') return { primitiveType: 'error_handler', label: 'Make Error Handler Route', event: 'Resume', configuration: { errorPath: true } };
    if (node.role === 'sub-workflow') return { primitiveType: 'call_scenario', label: 'Call a Scenario', event: 'Call a scenario', configuration: { explicitInputOutputContract: true } };
    if (node.role.endsWith('-end') || node.role === 'meaningful-end') return { primitiveType: 'canonical-terminal', label: node.terminalOutcome ?? node.title, event: null };
    if (node.role === 'validation-gate') return { primitiveType: 'filter', label: 'Validation Route Filter', event: 'Filter bundle' };
    if (node.role === 'notification') return { primitiveType: 'notification', label: 'Messaging Module', event: 'Send a message' };
    if (node.role === 'logging') return { primitiveType: 'data_store', label: 'Data Store Logging', event: 'Add/replace a record' };
    if (node.role === 'data-retrieval') return { primitiveType: 'action_module', label: 'Connected App Search Module', event: 'Search records' };
    if (node.role === 'data-transformation') return this.capabilityOperationMapping(node);
    return { primitiveType: 'tools', label: 'Tools Transformer', event: 'Set variable' };
  }

  private capabilityOperationMapping(node: V22ConceptualNode) {
    const operations = node.underlyingOperations.map((item) => item.toLowerCase());
    if (operations.some((item) => /notif|send|email|message/.test(item))) return { primitiveType: 'notification', label: 'Connected Messaging Module', event: 'Send a message' };
    if (operations.some((item) => /retriev|search|find|get/.test(item))) return { primitiveType: 'action_module', label: 'Connected App Search Module', event: 'Search records' };
    if (operations.some((item) => /create/.test(item))) return { primitiveType: 'action_module', label: 'Connected App Create Module', event: 'Create a record' };
    if (operations.some((item) => /update|save/.test(item))) return { primitiveType: 'action_module', label: 'Connected App Update Module', event: 'Update a record' };
    return { primitiveType: 'tools', label: 'Tools Transformer', event: 'Set variable', configuration: { unresolvedApplicationOperation: true } };
  }

  private node(node: V22ConceptualNode, primitiveType: string, label: string, event: string | null, primitiveKind: TranslatedImplementationNode['primitiveKind'], configuration: Record<string, unknown>, capabilityRefs: string[], operation: { applicationId: string; operationId: string } | null): TranslatedImplementationNode {
    return {
      id: `make-node-${String(++this.sequence).padStart(3, '0')}`, platform: 'make', primitiveKind, primitiveType, label, event,
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
      const mapping = operation?.knownPlatformMappings.find((item) => item.platform === 'make');
      if (!operation || !mapping || mapping.support === 'unsupported' || mapping.support === 'unknown') {
        warnings.push(this.warning('MAKE_OPERATION_UNAVAILABLE', 'unsupported-feature', `${value} has no verified Make implementation and was not invented.`, node, []));
        return null;
      }
      if (mapping.support === 'workaround') warnings.push(this.warning('MAKE_OPERATION_WORKAROUND', 'platform-limitation', mapping.limitation ?? `${value} requires a workaround.`, node, mapping.capabilityId ? [mapping.capabilityId] : []));
      return { applicationId: operation.applicationId, operationId: operation.operationId };
    }
    return null;
  }

  private capability(node: V22ConceptualNode) {
    const functionId = roleCapability[node.role];
    return functionId ? platformCapabilities.find((item) => item.platform === 'make' && item.canonicalFunctionId === functionId) : undefined;
  }

  private warning(code: string, kind: TranslationWarning['kind'], message: string, node: V22ConceptualNode, capabilityRefs: string[]): TranslationWarning {
    return { code, severity: 'warning', kind, message, conceptualNodeIds: [node.id], capabilityRefs };
  }
}
