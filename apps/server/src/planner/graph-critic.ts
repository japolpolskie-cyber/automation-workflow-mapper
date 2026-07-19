import { getOperation } from '@awm/knowledge';
import {
  graphCritiqueSchema,
  type GraphCritique,
  type GraphCritiqueIssue,
  type Platform,
  type PlatformTranslationResult,
  type V22ConceptualGraph,
  type V22ConceptualNode,
} from '@awm/shared';
import { validateMakeTranslation } from './make-translation-validator.js';
import { validateN8nTranslation } from './n8n-translation-validator.js';
import { validateV22ConceptualGraph } from './v2-conceptual-graph-validator.js';
import { validateZapierTranslation } from './zapier-translation-validator.js';

const genericLabel = /^(?:action|process|step|operation|perform action|workflow start|start|end|edit fields|connected app(?:lication)?(?: action| create| update| retrieval)?)(?:\s+\d+)?$/i;
const endRoles = new Set(['meaningful-end', 'successful-end', 'blocked-end', 'escalation-end']);
const synchronizationRoles = new Set(['merge-all', 'merge-any', 'branch-merge']);
const waitRoles = new Set(['event-wait', 'delay-boundary']);
const loopRoles = new Set(['business-loop', 'loop-until']);

export class GraphCritic {
  public critiqueConceptual(graph: V22ConceptualGraph): GraphCritique {
    const issues: GraphCritiqueIssue[] = validateV22ConceptualGraph(graph).map((finding) => {
      const node = finding.nodeId ? graph.nodes.find((item) => item.id === finding.nodeId) : undefined;
      const edge = finding.edgeId ? graph.edges.find((item) => item.id === finding.edgeId) : undefined;
      return this.issue({
        severity: 'error',
        code: `CRITIC_${finding.code}`,
        category: finding.code.includes('TRACEABILITY') ? 'traceability' : 'structural-quality',
        nodes: finding.nodeId ? [finding.nodeId] : [],
        edges: finding.edgeId ? [finding.edgeId] : [],
        sources: node?.sourceReferences ?? edge?.sourceReferences ?? [],
        explanation: finding.message,
        evidence: [finding.code],
        repair: repairForValidationCode(finding.code),
        safety: 'review-required',
        confidence: 1,
      });
    });
    const outgoing = new Map(graph.nodes.map((node) => [node.id, graph.edges.filter((edge) => edge.source === node.id)]));

    for (const node of graph.nodes) {
      if (genericLabel.test(node.title.trim())) {
        issues.push(this.nodeIssue('CRITIC_GENERIC_BUSINESS_LABEL', 'semantic-quality', node, `${node.title} does not communicate a specific business operation.`, [`title:${node.title}`], 'rename', 'safe', 0.98, 'suggestion'));
      }
      const operationDefinitions = node.underlyingOperations
        .map((value) => /^([a-z0-9-]+)\.([a-z0-9-]+)$/i.exec(value))
        .filter((match): match is RegExpExecArray => Boolean(match))
        .map((match) => getOperation(match[1]!, match[2]!))
        .filter((operation) => operation !== undefined);
      const functionIds = new Set(operationDefinitions.map((operation) => operation.canonicalFunctionId));
      if (functionIds.has('trigger') && [...functionIds].some((id) => id !== 'trigger')) {
        issues.push(this.nodeIssue('CRITIC_UNRELATED_OPERATIONS_GROUPED', 'semantic-quality', node, 'A trigger and downstream operation are grouped into one conceptual node despite distinct execution boundaries.', [...functionIds].map((id) => `canonical-function:${id}`), 'split-node', 'review-required', 0.96, 'warning'));
      }
      if ((node.role === 'binary-decision') && /review|approv|reject|sign[- ]?off/i.test(`${node.title} ${node.purpose} ${node.sourceReferences.map((ref) => ref.text).join(' ')}`)) {
        const hasHumanBoundary = graph.nodes.some((candidate) => ['human-review', 'approval', 'manual-review'].includes(candidate.role));
        if (!hasHumanBoundary) issues.push(this.nodeIssue('CRITIC_HUMAN_REVIEW_AS_CONDITION', 'semantic-quality', node, 'Human review is represented only as a condition without an explicit human interaction boundary.', ['human-review language', 'no human-review or approval node'], 'preserve-role', 'review-required', 0.94, 'warning'));
      }
      if (endRoles.has(node.role) && (!node.terminalOutcome || genericLabel.test(node.terminalOutcome) || /^(?:done|complete|completed|end)$/i.test(node.terminalOutcome))) {
        issues.push(this.nodeIssue('CRITIC_WEAK_TERMINAL_OUTCOME', 'semantic-quality', node, 'The terminal does not express a meaningful business outcome.', [`terminalOutcome:${node.terminalOutcome ?? 'missing'}`], 'clarify-outcome', 'review-required', 0.99, 'warning'));
      }
      if (!node.sourceReferences.length) {
        issues.push(this.nodeIssue('CRITIC_WEAK_SOURCE_TRACEABILITY', 'traceability', node, 'The node lacks a source requirement reference or evidence link.', [`sourceReferences:${node.sourceReferences.length}`, `evidenceIds:${node.evidenceIds.length}`], 'restore-traceability', 'safe', 1, 'error'));
      } else if (node.evidenceIds.length === 0) {
        issues.push(this.nodeIssue('CRITIC_WEAK_EVIDENCE_TRACEABILITY', 'traceability', node, 'The node preserves its requirement source but has no direct evidence identifier.', [`sourceReferences:${node.sourceReferences.length}`, 'evidenceIds:0'], 'restore-traceability', 'safe', 0.99, 'suggestion'));
      }
    }

    const repeated = new Map<string, V22ConceptualNode[]>();
    for (const node of graph.nodes) {
      const key = `${node.role}|${normalize(node.title)}|${[...node.underlyingOperations].sort().join('|')}`;
      repeated.set(key, [...(repeated.get(key) ?? []), node]);
    }
    for (const nodes of repeated.values()) if (nodes.length > 1) {
      issues.push(this.issue({
        severity: 'warning', code: 'CRITIC_REPEATED_EQUIVALENT_CAPABILITY', category: 'fragmentation',
        nodes: nodes.map((node) => node.id), edges: [], sources: uniqueSources(nodes.flatMap((node) => node.sourceReferences)),
        explanation: 'Equivalent conceptual capabilities appear more than once without a distinct execution boundary.',
        evidence: nodes.map((node) => `${node.id}:${node.title}`), repair: 'merge-nodes', safety: 'review-required', confidence: 0.98,
      }));
    }

    const fragments = graph.nodes.filter((node) => node.role === 'data-transformation' && node.underlyingOperations.length === 1);
    if (fragments.length >= 4) {
      const fragmentIds = new Set(fragments.map((node) => node.id));
      const linked = graph.edges.filter((edge) => fragmentIds.has(edge.source) && fragmentIds.has(edge.target)).length;
      const distinctSteps = new Set(fragments.flatMap((node) => node.sourceReferences.map((ref) => ref.stepId))).size;
      if (linked >= fragments.length - 1 && distinctSteps >= fragments.length) {
        issues.push(this.issue({
          severity: 'warning', code: 'CRITIC_ONE_NODE_PER_SENTENCE_FRAGMENTATION', category: 'fragmentation',
          nodes: fragments.map((node) => node.id), edges: graph.edges.filter((edge) => fragmentIds.has(edge.source) && fragmentIds.has(edge.target)).map((edge) => edge.id),
          sources: uniqueSources(fragments.flatMap((node) => node.sourceReferences)),
          explanation: 'A linear sequence contains one single-operation node for each source step, indicating literal sentence-level decomposition.',
          evidence: [`single-operation-nodes:${fragments.length}`, `linked-fragment-edges:${linked}`, `distinct-source-steps:${distinctSteps}`],
          repair: 'merge-nodes', safety: 'review-required', confidence: 0.95,
        }));
      }
    }

    for (const first of graph.nodes.filter((node) => node.role === 'binary-decision')) {
      const nextBinary = (outgoing.get(first.id) ?? []).map((edge) => graph.nodes.find((node) => node.id === edge.target)).find((node) => node?.role === 'binary-decision');
      if (!nextBinary) continue;
      const sharedStep = first.sourceReferences.some((a) => nextBinary.sourceReferences.some((b) => a.stepId === b.stepId));
      const routingLanguage = [...first.sourceReferences, ...nextBinary.sourceReferences].some((ref) => /route by|based on|otherwise|one of|category|status|priority|channel/i.test(ref.text));
      if (sharedStep && routingLanguage) issues.push(this.issue({
        severity: 'warning', code: 'CRITIC_NESTED_BINARY_MULTI_OUTCOME', category: 'structural-quality',
        nodes: [first.id, nextBinary.id], edges: (outgoing.get(first.id) ?? []).filter((edge) => edge.target === nextBinary.id).map((edge) => edge.id),
        sources: uniqueSources([...first.sourceReferences, ...nextBinary.sourceReferences]),
        explanation: 'Nested binary decisions from one routing requirement represent a multi-outcome decision.',
        evidence: ['adjacent binary decisions', 'shared source step', 'multi-route language'], repair: 'replace-decision', safety: 'review-required', confidence: 0.96,
      }));
    }

    const metrics = conceptualMetrics(graph, issues);
    return finish('conceptual', null, issues, metrics);
  }

  public critiquePlatform(graph: V22ConceptualGraph, translation: PlatformTranslationResult): GraphCritique {
    const validation = translation.selectedPlatform === 'n8n'
      ? validateN8nTranslation(translation)
      : translation.selectedPlatform === 'make'
        ? validateMakeTranslation(translation)
        : validateZapierTranslation(translation);
    const issues: GraphCritiqueIssue[] = validation.warnings.map((warning) => this.issue({
      severity: warning.severity === 'error' ? 'error' : 'warning',
      code: `CRITIC_${warning.code}`,
      category: warning.code.includes('LEAKAGE') || warning.code.includes('PRIMITIVE') ? 'platform-fidelity' : warning.code.includes('TRACEABILITY') ? 'traceability' : 'platform-fidelity',
      nodes: warning.conceptualNodeIds.flatMap((id) => translation.nodes.filter((node) => node.conceptualNodeIds.includes(id)).map((node) => node.id)),
      edges: [],
      sources: uniqueSources(translation.nodes.filter((node) => node.conceptualNodeIds.some((id) => warning.conceptualNodeIds.includes(id))).flatMap((node) => node.sourceReferences)),
      explanation: warning.message, evidence: [warning.code, ...warning.capabilityRefs], repair: warning.code.includes('OPERATION') ? 'resolve-operation' : 'restore-traceability',
      safety: 'review-required', confidence: 1,
    }));
    const warningByConcept = (id: string) => translation.warnings.some((warning) => warning.conceptualNodeIds.includes(id));
    const translatedByConcept = new Map(graph.nodes.map((node) => [node.id, translation.nodes.filter((candidate) => candidate.conceptualNodeIds.includes(node.id))]));

    for (const conceptual of graph.nodes) {
      const implementations = translatedByConcept.get(conceptual.id) ?? [];
      if (!implementations.length) {
        issues.push(this.nodeIssue('CRITIC_CONCEPTUAL_ROLE_OMITTED', 'metadata-preservation', conceptual, 'The conceptual node has no translated implementation unit.', [`conceptual-role:${conceptual.role}`], 'preserve-role', 'safe', 1, 'error'));
        continue;
      }
      if (implementations.some((node) => node.configuration.conceptualRole !== conceptual.role)) {
        issues.push(this.nodeIssue('CRITIC_CONCEPTUAL_ROLE_LOSS', 'metadata-preservation', conceptual, 'The translated node does not preserve its conceptual role metadata.', [`expected-role:${conceptual.role}`], 'preserve-role', 'safe', 1, 'error'));
      }
      if (implementations.some((node) => !node.sourceReferences.length || !node.conceptualNodeIds.includes(conceptual.id))) {
        issues.push(this.nodeIssue('CRITIC_PLATFORM_TRACEABILITY_GAP', 'traceability', conceptual, 'Conceptual-to-platform source traceability is incomplete.', [`conceptual-node:${conceptual.id}`], 'restore-traceability', 'safe', 1, 'error'));
      }
      if (implementations.some((node) => node.configuration.unresolvedApplicationOperation === true) && !warningByConcept(conceptual.id)) {
        issues.push(this.nodeIssue('CRITIC_UNSUPPORTED_OPERATION_WITHOUT_WARNING', 'platform-fidelity', conceptual, 'An unresolved application operation is represented without a structured warning.', ['unresolvedApplicationOperation:true', 'warning:false'], 'add-warning', 'safe', 1, 'error'));
      }
      if (implementations.some((node) => node.primitiveType === 'canonical-continuation') && !warningByConcept(conceptual.id)) {
        issues.push(this.nodeIssue('CRITIC_LOSSY_TRANSLATION_WITHOUT_WARNING', 'platform-fidelity', conceptual, 'A canonical continuation fallback is used without disclosing translation loss.', ['canonical-continuation', 'warning:false'], 'add-warning', 'safe', 1, 'error'));
      }
      if (synchronizationRoles.has(conceptual.role) && translation.selectedPlatform !== 'n8n' && !warningByConcept(conceptual.id)) {
        issues.push(this.nodeIssue('CRITIC_UNSUPPORTED_SYNCHRONIZATION_SILENT', 'platform-fidelity', conceptual, 'A platform without native universal synchronization represents merge semantics without a warning.', [`platform:${translation.selectedPlatform}`, `role:${conceptual.role}`], 'add-warning', 'safe', 1, 'error'));
      }
      if (metadataLost(conceptual, implementations)) {
        issues.push(this.nodeIssue('CRITIC_CONTROL_METADATA_LOSS', 'metadata-preservation', conceptual, 'Wait, collection, retry, terminal, or correlation metadata was not preserved during translation.', [`conceptual-role:${conceptual.role}`], 'preserve-metadata', 'safe', 1, 'error'));
      }
    }

    for (const edge of graph.edges) {
      const translated = translation.edges.find((candidate) => candidate.conceptualEdgeIds.includes(edge.id));
      if (!translated || translated.label !== edge.label) issues.push(this.issue({
        severity: 'error', code: 'CRITIC_BRANCH_LABEL_LOSS', category: 'metadata-preservation',
        nodes: [], edges: translated ? [translated.id] : [], sources: edge.sourceReferences,
        explanation: 'A conceptual edge label is missing or changed in the platform translation.',
        evidence: [`conceptual-edge:${edge.id}`, `expected-label:${edge.label}`, `actual-label:${translated?.label ?? 'missing'}`],
        repair: 'preserve-branch-label', safety: 'safe', confidence: 1,
      }));
    }

    const unresolved = translation.nodes.filter((node) => node.configuration.unresolvedApplicationOperation === true);
    const genericFallbacks = translation.nodes.filter((node) => node.configuration.unresolvedApplicationOperation === true || /^(?:action|app_action|action_module|formatter|tools|edit_fields)$/.test(node.primitiveType));
    if (translation.nodes.length >= 4 && genericFallbacks.length / translation.nodes.length > 0.5) issues.push(this.issue({
      severity: 'suggestion', code: 'CRITIC_EXCESSIVE_GENERIC_FALLBACKS', category: 'platform-fidelity',
      nodes: genericFallbacks.map((node) => node.id), edges: [], sources: uniqueSources(genericFallbacks.flatMap((node) => node.sourceReferences)),
      explanation: 'More than half of translated nodes use generic platform primitives rather than verified application operations.',
      evidence: [`generic:${genericFallbacks.length}`, `nodes:${translation.nodes.length}`], repair: 'resolve-operation', safety: 'review-required', confidence: 0.98,
    }));

    const metrics = platformMetrics(graph, translation, issues, unresolved.length);
    return finish('platform', translation.selectedPlatform, issues, metrics);
  }

  private nodeIssue(code: string, category: GraphCritiqueIssue['category'], node: V22ConceptualNode, explanation: string, evidence: string[], repair: GraphCritiqueIssue['suggestedRepairKind'], safety: GraphCritiqueIssue['repairSafety'], confidence: number, severity: GraphCritiqueIssue['severity']): GraphCritiqueIssue {
    return this.issue({ severity, code, category, nodes: [node.id], edges: [], sources: node.sourceReferences, explanation, evidence, repair, safety, confidence });
  }

  private issue(input: { severity: GraphCritiqueIssue['severity']; code: string; category: GraphCritiqueIssue['category']; nodes: string[]; edges: string[]; sources: GraphCritiqueIssue['sourceReferences']; explanation: string; evidence: string[]; repair: GraphCritiqueIssue['suggestedRepairKind']; safety: GraphCritiqueIssue['repairSafety']; confidence: number }): GraphCritiqueIssue {
    return { severity: input.severity, code: input.code, category: input.category, nodeIds: input.nodes, edgeIds: input.edges, sourceReferences: input.sources, explanation: input.explanation, evidence: input.evidence.length ? input.evidence : [input.code], suggestedRepairKind: input.repair, repairSafety: input.safety, confidence: input.confidence };
  }
}

function metadataLost(conceptual: V22ConceptualNode, nodes: PlatformTranslationResult['nodes']): boolean {
  const configs = nodes.map((node) => node.configuration);
  if (waitRoles.has(conceptual.role)) {
    if (!configs.some((config) => config.wait !== undefined || config.resumeCondition === conceptual.wait?.resumeCondition)) return true;
    const correlationIdentifier = conceptual.wait?.correlationIdentifier;
    if (correlationIdentifier && !configs.some((config) => config.correlationIdentifier === correlationIdentifier || (config.wait as { correlationIdentifier?: string } | null)?.correlationIdentifier === correlationIdentifier)) return true;
  }
  if (conceptual.role === 'collection-iterator' && !configs.some((config) => config.collectionSource === conceptual.collectionSource)) return true;
  if (conceptual.role === 'technical-retry' && !configs.some((config) => config.retry !== undefined || config.maximumAttempts === conceptual.retry?.maximumAttempts)) return true;
  if (endRoles.has(conceptual.role) && !configs.some((config) => config.terminalOutcome === conceptual.terminalOutcome)) return true;
  return false;
}

function conceptualMetrics(graph: V22ConceptualGraph, issues: GraphCritiqueIssue[]) {
  return baseMetrics(graph, issues, 1, 1, 0);
}

function platformMetrics(graph: V22ConceptualGraph, translation: PlatformTranslationResult, issues: GraphCritiqueIssue[], unresolved: number) {
  const covered = graph.nodes.filter((node) => translation.nodes.some((candidate) => candidate.conceptualNodeIds.includes(node.id) && candidate.configuration.conceptualRole === node.role)).length;
  const traced = translation.nodes.filter((node) => node.sourceReferences.length && node.conceptualNodeIds.length).length;
  const operationPopulation = translation.nodes.filter((node) => node.applicationId || node.operationId || node.configuration.unresolvedApplicationOperation === true).length;
  const safety = operationPopulation ? Math.max(0, 1 - translation.diagnostics.invalidOperationReferenceCount / operationPopulation) : 1;
  return {
    ...baseMetrics(graph, issues, translation.nodes.length ? traced / translation.nodes.length : 1, graph.nodes.length ? covered / graph.nodes.length : 1, unresolved),
    nodeCount: translation.nodes.length,
    edgeCount: translation.edges.length,
    warningCount: translation.warnings.length,
    platformCapabilitySafetyRate: safety,
  };
}

function baseMetrics(graph: V22ConceptualGraph, issues: GraphCritiqueIssue[], traceabilityCoverage: number, rolePreservation: number, unresolvedOperationCount: number) {
  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    capabilityCount: new Set(graph.nodes.flatMap((node) => node.capabilityGroupIds)).size,
    genericLabelCount: graph.nodes.filter((node) => genericLabel.test(node.title.trim())).length,
    binaryDecisionCount: graph.nodes.filter((node) => node.role === 'binary-decision').length,
    multiOutcomeCount: graph.nodes.filter((node) => node.role === 'multi-route-decision').length,
    parallelRouteCount: graph.nodes.filter((node) => node.role === 'parallel-split' || node.role === 'conditional-parallel-routing').length,
    synchronizationCount: graph.nodes.filter((node) => synchronizationRoles.has(node.role)).length,
    waitCount: graph.nodes.filter((node) => waitRoles.has(node.role)).length,
    loopCount: graph.nodes.filter((node) => loopRoles.has(node.role)).length,
    iteratorCount: graph.nodes.filter((node) => node.role === 'collection-iterator').length,
    aggregatorCount: graph.nodes.filter((node) => node.role === 'item-aggregator').length,
    retryCount: graph.nodes.filter((node) => node.role === 'technical-retry').length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
    unresolvedOperationCount,
    traceabilityCoverage,
    conceptualRolePreservationRate: rolePreservation,
    platformCapabilitySafetyRate: 1,
  };
}

function finish(graphKind: 'conceptual' | 'platform', platform: Platform | null, issues: GraphCritiqueIssue[], metrics: ReturnType<typeof baseMetrics>): GraphCritique {
  const aggregate = {
    errorCount: issues.filter((issue) => issue.severity === 'error').length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
    suggestionCount: issues.filter((issue) => issue.severity === 'suggestion').length,
  };
  const maximumSeverity = aggregate.errorCount ? 'error' : aggregate.warningCount ? 'warning' : aggregate.suggestionCount ? 'suggestion' : 'none';
  return graphCritiqueSchema.parse({ version: '2.4A', shadowMode: true, graphKind, platform, valid: aggregate.errorCount === 0, maximumSeverity, issues, metrics, aggregate });
}

function repairForValidationCode(code: string): GraphCritiqueIssue['suggestedRepairKind'] {
  if (code.includes('SYNCHRONIZATION') || code.includes('MERGE')) return 'add-synchronization';
  if (code.includes('CORRELATION')) return 'add-correlation';
  if (code.includes('WAIT')) return 'add-resume';
  if (code.includes('ITERATOR')) return 'add-collection-source';
  if (code.includes('AGGREGATOR')) return 'add-item-input';
  if (code.includes('LOOP')) return 'bound-loop';
  if (code.includes('RETRY')) return 'add-exhausted-path';
  if (code.includes('TERMINAL')) return 'clarify-outcome';
  if (code.includes('TRACEABILITY')) return 'restore-traceability';
  return 'none';
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function uniqueSources(sources: GraphCritiqueIssue['sourceReferences']): GraphCritiqueIssue['sourceReferences'] {
  return [...new Map(sources.map((source) => [`${source.segmentId}:${source.stepId}:${source.start}:${source.end}`, source])).values()];
}
