import { applicationPacks, platformCapabilities, type CanonicalFunctionId } from '@awm/knowledge';
import { n8nCatalog } from '@awm/platforms';
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
import { validateN8nTranslation } from './n8n-translation-validator.js';

const roleCapability: Partial<Record<V22ConceptualNode['role'], CanonicalFunctionId>> = {
  'workflow-trigger': 'trigger',
  'data-retrieval': 'data-retrieval',
  'data-transformation': 'data-transformation',
  'validation-gate': 'validation',
  'binary-decision': 'binary-condition',
  'multi-route-decision': 'multi-route-decision',
  'parallel-split': 'multi-route-decision',
  'conditional-parallel-routing': 'multi-route-decision',
  'merge-all': 'merge',
  'merge-any': 'merge',
  'human-review': 'manual-review',
  approval: 'human-approval',
  'manual-review': 'manual-review',
  'event-wait': 'delay',
  'delay-boundary': 'delay',
  'resume-point': 'data-transformation',
  'collection-iterator': 'iterator',
  'item-aggregator': 'aggregator',
  'business-loop': 'loop',
  'loop-until': 'loop',
  'technical-retry': 'retry',
  'branch-merge': 'merge',
  'error-handler': 'error-handler',
  notification: 'notification',
  logging: 'logging',
  'sub-workflow': 'action',
  'successful-end': 'end',
  'blocked-end': 'end',
  'escalation-end': 'end',
  'meaningful-end': 'end',
};

interface UnitTranslation {
  nodes: TranslatedImplementationNode[];
  unit: ImplementationUnit;
  warnings: TranslationWarning[];
}

export class N8nConceptualTranslator implements PlatformTranslator {
  public readonly platform = 'n8n' as const;
  private sequence = 0;
  private edgeSequence = 0;

  public translate(graph: V22ConceptualGraph): PlatformTranslationResult {
    this.sequence = 0;
    this.edgeSequence = 0;
    const translated = graph.nodes.map((node) => this.translateNode(node));
    const nodes = translated.flatMap((item) => item.nodes);
    const units = translated.map((item) => item.unit);
    const warnings = translated.flatMap((item) => item.warnings);
    const unitsByConcept = new Map(units.flatMap((unit) => unit.conceptualNodeIds.map((id) => [id, unit])));
    const edges: TranslatedImplementationEdge[] = graph.edges.map((edge) => ({
      id: `n8n-edge-${String(++this.edgeSequence).padStart(3, '0')}`,
      platform: 'n8n',
      source: unitsByConcept.get(edge.source)!.exitNodeId,
      target: unitsByConcept.get(edge.target)!.entryNodeId,
      label: edge.label,
      condition: edge.condition,
      conceptualEdgeIds: [edge.id],
      evidenceIds: edge.evidenceIds,
      sourceReferences: edge.sourceReferences,
    }));

    const base = {
      version: '2.3A' as const,
      shadowMode: true as const,
      selectedPlatform: 'n8n' as const,
      sourceGraphVersion: '2.2' as const,
      sourceEntryNodeId: graph.entryNodeId,
      nodes,
      edges,
      units,
      warnings,
    };
    const validation = validateN8nTranslation(base);
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
    if (capability?.support === 'workaround') warnings.push(this.warning('N8N_WORKAROUND_REQUIRED', 'platform-limitation', capability.limitation ?? `${capability.implementation} requires a composed n8n pattern.`, node, [capability.id]));
    if (node.role === 'merge-any') warnings.push(this.warning('N8N_MERGE_ANY_REVIEW', 'lossy-translation', 'n8n Merge choose-branch behavior depends on input timing and must be reviewed against the intended first-result semantics.', node, capability ? [capability.id] : []));

    const operation = this.verifiedOperation(node, warnings);
    const mapping = this.mapping(node);
    const definition = mapping.primitiveType === 'canonical-terminal' ? null : n8nCatalog.find((item) => item.type === mapping.primitiveType);
    if (!definition && mapping.primitiveType !== 'canonical-terminal') warnings.push(this.warning('N8N_PRIMITIVE_UNAVAILABLE', 'unsupported-feature', `${mapping.primitiveType} is unavailable in the approved n8n catalog.`, node, capability ? [capability.id] : []));
    const implementation = this.node(node, mapping.primitiveType, mapping.label, mapping.event, mapping.primitiveType === 'canonical-terminal' ? 'canonical-boundary' : 'platform-node', {
      conceptualRole: node.role,
      collectionSource: node.collectionSource,
      wait: node.wait,
      retry: node.retry,
      terminalOutcome: node.terminalOutcome,
      ...(mapping.configuration ?? {}),
    }, capability ? [capability.id] : [], operation);
    const unit: ImplementationUnit = {
      id: `n8n-unit-${node.id}`,
      kind: node.role === 'meaningful-end' || node.role.endsWith('-end') ? 'terminal' : node.role === 'technical-retry' ? 'metadata' : 'node',
      conceptualNodeIds: [node.id],
      entryNodeId: implementation.id,
      exitNodeId: implementation.id,
      implementationNodeIds: [implementation.id],
      purpose: node.purpose,
    };
    return { nodes: [implementation], unit, warnings };
  }

  private mapping(node: V22ConceptualNode): { primitiveType: string; label: string; event: string | null; configuration?: Record<string, unknown> } {
    if (node.role === 'workflow-trigger') return { primitiveType: 'trigger', label: 'n8n Trigger', event: 'On event', configuration: { fallback: 'canonical-start-when-no-explicit-platform-trigger' } };
    if (node.role === 'binary-decision') return { primitiveType: 'if', label: 'IF', event: 'IF' };
    if (node.role === 'multi-route-decision') return { primitiveType: 'switch', label: 'Switch', event: 'Switch', configuration: { routeMode: 'firstMatchingOutput' } };
    if (node.role === 'parallel-split') return { primitiveType: 'switch', label: 'Switch Parallel Branches', event: 'Switch', configuration: { routeMode: 'explicitOutputs' } };
    if (node.role === 'conditional-parallel-routing') return { primitiveType: 'switch', label: 'Switch Conditional Parallel Branches', event: 'Switch', configuration: { routeMode: 'allMatchingOutputs' } };
    if (node.role === 'merge-all') return { primitiveType: 'merge', label: 'Merge All Required Inputs', event: 'Combine', configuration: { synchronization: 'wait-for-all-inputs' } };
    if (node.role === 'merge-any') return { primitiveType: 'merge', label: 'Merge First Qualifying Input', event: 'Choose Branch', configuration: { synchronization: 'first-valid-input' } };
    if (node.role === 'branch-merge') return { primitiveType: 'merge', label: 'Merge Branches', event: 'Append', configuration: { synchronization: 'continue-after-branches' } };
    if (node.role === 'human-review' || node.role === 'approval' || node.role === 'manual-review') return { primitiveType: 'notification', label: 'Send Human Review Request', event: 'Send message', configuration: { responseHandledBy: 'following-wait-node' } };
    if (node.role === 'event-wait') return { primitiveType: 'wait', label: 'Wait For External Event', event: 'On webhook call', configuration: { correlationIdentifier: node.wait?.correlationIdentifier, resumeCondition: node.wait?.resumeCondition } };
    if (node.role === 'delay-boundary') return { primitiveType: 'wait', label: 'Wait For Time Boundary', event: 'After time interval', configuration: { resumeCondition: node.wait?.resumeCondition, timeoutPolicy: node.wait?.timeoutPolicy } };
    if (node.role === 'resume-point') return { primitiveType: 'edit_fields', label: 'Resume Data Boundary', event: 'Set fields', configuration: { boundary: 'resume' } };
    if (node.role === 'collection-iterator') return { primitiveType: 'loop', label: 'Loop Over Items', event: 'Loop Over Items', configuration: { collectionSource: node.collectionSource, batchSize: 1 } };
    if (node.role === 'item-aggregator') return { primitiveType: 'aggregate', label: 'Aggregate Item Results', event: 'Aggregate All Item Data' };
    if (node.role === 'business-loop' || node.role === 'loop-until') return { primitiveType: 'if', label: 'IF Loop Exit Condition', event: 'IF', configuration: { boundedCycle: true } };
    if (node.role === 'technical-retry') return { primitiveType: 'action', label: 'Retry-Enabled Action Boundary', event: 'Update', configuration: { retryOnFail: true, maximumAttempts: node.retry?.maximumAttempts, backoff: node.retry?.backoff } };
    if (node.role === 'error-handler') return { primitiveType: 'error_trigger', label: 'Error Trigger Boundary', event: 'Error Trigger', configuration: { errorPath: true } };
    if (node.role === 'sub-workflow') return { primitiveType: 'execute_workflow', label: 'Execute Workflow', event: 'Execute sub-workflow', configuration: { waitForCompletion: true } };
    if (node.role === 'meaningful-end' || node.role.endsWith('-end')) return { primitiveType: 'canonical-terminal', label: node.terminalOutcome ?? node.title, event: null };
    if (node.role === 'validation-gate') return { primitiveType: 'if', label: 'IF Validation Gate', event: 'IF' };
    if (node.role === 'notification') return { primitiveType: 'notification', label: 'Messaging Node', event: 'Send message' };
    if (node.role === 'logging') return { primitiveType: 'log', label: 'Logging Node', event: 'External log action' };
    if (node.role === 'data-retrieval') return { primitiveType: 'action', label: 'Connected App Retrieval', event: 'Get' };
    if (node.role === 'data-transformation' && node.capabilityGroupIds.length) return this.capabilityOperationMapping(node);
    return { primitiveType: 'edit_fields', label: 'Edit Fields', event: 'Set fields' };
  }

  private capabilityOperationMapping(node: V22ConceptualNode) {
    const operations = node.underlyingOperations.map((item) => item.toLowerCase());
    if (operations.some((item) => /notif|send|email|message/.test(item))) return { primitiveType: 'notification', label: 'Connected App Notification', event: 'Send message' };
    if (operations.some((item) => /retriev|search|find|get/.test(item))) return { primitiveType: 'action', label: 'Connected App Retrieval', event: 'Get' };
    if (operations.some((item) => /create/.test(item))) return { primitiveType: 'action', label: 'Connected App Create', event: 'Create' };
    if (operations.some((item) => /update|save/.test(item))) return { primitiveType: 'action', label: 'Connected App Update', event: 'Update' };
    return { primitiveType: 'edit_fields', label: 'Edit Fields', event: 'Set fields', configuration: { unresolvedApplicationOperation: true } };
  }

  private node(node: V22ConceptualNode, primitiveType: string, label: string, event: string | null, primitiveKind: TranslatedImplementationNode['primitiveKind'], configuration: Record<string, unknown>, capabilityRefs: string[], operation: { applicationId: string; operationId: string } | null): TranslatedImplementationNode {
    return {
      id: `n8n-node-${String(++this.sequence).padStart(3, '0')}`,
      platform: 'n8n',
      primitiveKind,
      primitiveType,
      label,
      event,
      conceptualNodeIds: [node.id],
      capabilityGroupIds: node.capabilityGroupIds,
      capabilityRefs,
      applicationId: operation?.applicationId ?? null,
      operationId: operation?.operationId ?? null,
      configuration,
      evidenceIds: node.evidenceIds,
      sourceReferences: node.sourceReferences,
      lifecycleStage: node.lifecycleStage,
      underlyingOperations: node.underlyingOperations,
      confidence: node.confidence,
    };
  }

  private verifiedOperation(node: V22ConceptualNode, warnings: TranslationWarning[]): { applicationId: string; operationId: string } | null {
    for (const value of node.underlyingOperations) {
      const match = /^([a-z0-9-]+)\.([a-z0-9-]+)$/i.exec(value);
      if (!match) continue;
      const pack = applicationPacks.find((item) => item.applicationId === match[1]);
      const operation = pack?.operations.find((item) => item.operationId === match[2]);
      const mapping = operation?.knownPlatformMappings.find((item) => item.platform === 'n8n');
      if (!operation || !mapping || mapping.support === 'unsupported' || mapping.support === 'unknown') {
        warnings.push(this.warning('N8N_OPERATION_UNAVAILABLE', 'unsupported-feature', `${value} has no verified n8n implementation and was not invented.`, node, []));
        return null;
      }
      if (mapping.support === 'workaround') warnings.push(this.warning('N8N_OPERATION_WORKAROUND', 'platform-limitation', mapping.limitation ?? `${value} requires a workaround.`, node, mapping.capabilityId ? [mapping.capabilityId] : []));
      return { applicationId: operation.applicationId, operationId: operation.operationId };
    }
    return null;
  }

  private capability(node: V22ConceptualNode) {
    const canonicalFunctionId = roleCapability[node.role];
    return canonicalFunctionId ? platformCapabilities.find((item) => item.platform === 'n8n' && item.canonicalFunctionId === canonicalFunctionId) : undefined;
  }

  private warning(code: string, kind: TranslationWarning['kind'], message: string, node: V22ConceptualNode, capabilityRefs: string[]): TranslationWarning {
    return { code, severity: 'warning', kind, message, conceptualNodeIds: [node.id], capabilityRefs };
  }
}
