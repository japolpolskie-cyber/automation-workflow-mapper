import {
  graphRepairBundleSchema,
  graphRepairReportSchema,
  platformTranslationResultSchema,
  v22ConceptualGraphSchema,
  type GraphCritique,
  type GraphCritiqueIssue,
  type GraphRepairAction,
  type GraphRepairBundle,
  type GraphRepairReport,
  type PlatformTranslationResult,
  type TranslationWarning,
  type V21AnalysisArtifacts,
  type V22ConceptualGraph,
} from '@awm/shared';
import { GraphCritic } from './graph-critic.js';
import { validateMakeTranslation } from './make-translation-validator.js';
import { validateN8nTranslation } from './n8n-translation-validator.js';
import { validateV22ConceptualGraph } from './v2-conceptual-graph-validator.js';
import { validateZapierTranslation } from './zapier-translation-validator.js';

type SourceReference = V22ConceptualGraph['nodes'][number]['sourceReferences'][number];
type ActionSeed = Omit<GraphRepairAction, 'validation'>;
type RepairValidationGuard = (
  graphKind: 'conceptual' | 'platform',
  candidate: V22ConceptualGraph | PlatformTranslationResult,
) => string[];

export class SafeGraphRepairService {
  public constructor(
    private readonly critic = new GraphCritic(),
    private readonly validationGuard: RepairValidationGuard = () => [],
  ) {}

  public repair(v21: V21AnalysisArtifacts, conceptual: V22ConceptualGraph, translation?: PlatformTranslationResult): GraphRepairBundle {
    const conceptualResult = this.repairConceptual(v21, conceptual);
    const platformResult = translation ? this.repairPlatform(conceptualResult.graph, translation) : undefined;
    return graphRepairBundleSchema.parse({
      conceptual: conceptualResult,
      ...(platformResult ? { platform: platformResult } : {}),
    });
  }

  private repairConceptual(v21: V21AnalysisArtifacts, original: V22ConceptualGraph) {
    const beforeCritique = this.critic.critiqueConceptual(original);
    let current = structuredClone(original);
    const actions: GraphRepairAction[] = [];

    for (const node of [...current.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
      const missingTrace = !node.sourceReferences.length || !node.capabilityGroupIds.length;
      const duplicates = hasDuplicates(node.sourceReferences, sourceKey) || hasDuplicates(node.factIds) || hasDuplicates(node.evidenceIds) || hasDuplicates(node.capabilityGroupIds);
      if (missingTrace) {
        const source = conceptualSource(v21, current, node.id);
        if (!source) {
          actions.push(skipped('CRITIC_WEAK_SOURCE_TRACEABILITY', 'restore-traceability', [node.id], [], 'Missing conceptual traceability.', 'No single existing V2.1 or incident-edge source can be selected without inference.', node.sourceReferences));
        } else {
          const result = this.attemptConceptual(current, {
            sourceIssueCode: 'CRITIC_WEAK_SOURCE_TRACEABILITY', repairKind: 'restore-traceability', repairSafety: 'safe',
            nodeIds: [node.id], edgeIds: [], beforeSummary: 'Conceptual node traceability is incomplete.',
            afterSummary: 'Traceability restored from an unambiguous existing source.', fieldsChanged: source.fields,
            sourceReferences: source.references, evidence: source.evidence, confidence: 1, status: 'applied', skipReason: null,
          }, (candidate) => {
            const target = candidate.nodes.find((item) => item.id === node.id)!;
            if (!target.sourceReferences.length) target.sourceReferences = structuredClone(source.references);
            if (!target.capabilityGroupIds.length) target.capabilityGroupIds = [...source.capabilityGroupIds];
            if (!target.factIds.length) target.factIds = [...source.factIds];
            if (!target.evidenceIds.length) target.evidenceIds = [...source.evidenceIds];
          });
          current = result.graph;
          actions.push(result.action);
        }
      }
      if (duplicates) {
        const result = this.attemptConceptual(current, {
          sourceIssueCode: 'CANONICAL_DUPLICATE_REFERENCES', repairKind: 'canonical-normalization', repairSafety: 'safe',
          nodeIds: [node.id], edgeIds: [], beforeSummary: 'Conceptual metadata contains exact duplicate references.',
          afterSummary: 'Exact duplicate references removed without changing order.', fieldsChanged: ['sourceReferences', 'factIds', 'evidenceIds', 'capabilityGroupIds'],
          sourceReferences: node.sourceReferences, evidence: ['exact-value duplicate keys'], confidence: 1, status: 'applied', skipReason: null,
        }, (candidate) => {
          const target = candidate.nodes.find((item) => item.id === node.id)!;
          target.sourceReferences = dedupe(target.sourceReferences, sourceKey);
          target.factIds = dedupe(target.factIds);
          target.evidenceIds = dedupe(target.evidenceIds);
          target.capabilityGroupIds = dedupe(target.capabilityGroupIds);
        });
        current = result.graph;
        actions.push(result.action);
      }
    }
    for (const edge of [...current.edges].sort((a, b) => a.id.localeCompare(b.id))) {
      if (!hasDuplicates(edge.sourceReferences, sourceKey) && !hasDuplicates(edge.evidenceIds)) continue;
      const result = this.attemptConceptual(current, {
        sourceIssueCode: 'CANONICAL_DUPLICATE_REFERENCES', repairKind: 'canonical-normalization', repairSafety: 'safe',
        nodeIds: [], edgeIds: [edge.id], beforeSummary: 'Conceptual edge metadata contains exact duplicates.',
        afterSummary: 'Exact duplicate edge references removed.', fieldsChanged: ['sourceReferences', 'evidenceIds'],
        sourceReferences: edge.sourceReferences, evidence: ['exact-value duplicate keys'], confidence: 1, status: 'applied', skipReason: null,
      }, (candidate) => {
        const target = candidate.edges.find((item) => item.id === edge.id)!;
        target.sourceReferences = dedupe(target.sourceReferences, sourceKey);
        target.evidenceIds = dedupe(target.evidenceIds);
      });
      current = result.graph;
      actions.push(result.action);
    }

    actions.push(...reviewOnlyActions(beforeCritique, actions));
    const afterCritique = this.critic.critiqueConceptual(current);
    const validation = conceptualValidation(current);
    return {
      graph: current,
      report: report('conceptual', null, actions, validation, beforeCritique, afterCritique),
    };
  }

  private repairPlatform(conceptual: V22ConceptualGraph, original: PlatformTranslationResult) {
    const beforeCritique = this.critic.critiquePlatform(conceptual, original);
    let current = structuredClone(original);
    const actions: GraphRepairAction[] = [];
    const units = new Map(current.units.flatMap((unit) => unit.implementationNodeIds.map((id) => [id, unit])));

    for (const node of [...current.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
      const unit = units.get(node.id);
      const mappedIds = node.conceptualNodeIds.length ? node.conceptualNodeIds : unit?.conceptualNodeIds ?? [];
      const sourceNodes = conceptual.nodes.filter((item) => mappedIds.includes(item.id));
      if (sourceNodes.length === 1) {
        const source = sourceNodes[0]!;
        const traceFields: string[] = [];
        if (!node.conceptualNodeIds.length) traceFields.push('conceptualNodeIds');
        if (!node.sourceReferences.length) traceFields.push('sourceReferences');
        if (!node.capabilityGroupIds.length && source.capabilityGroupIds.length) traceFields.push('capabilityGroupIds');
        if (node.lifecycleStage !== source.lifecycleStage) traceFields.push('lifecycleStage');
        if (node.confidence !== source.confidence) traceFields.push('confidence');
        if (traceFields.length) {
          const result = this.attemptPlatform(conceptual, current, {
            sourceIssueCode: 'CRITIC_PLATFORM_TRACEABILITY_GAP', repairKind: 'restore-traceability', repairSafety: 'safe',
            nodeIds: [node.id], edgeIds: [], beforeSummary: 'Translated node traceability or source metadata is incomplete.',
            afterSummary: 'Exact conceptual metadata restored through the implementation-unit mapping.', fieldsChanged: traceFields,
            sourceReferences: source.sourceReferences, evidence: [`conceptual-node:${source.id}`, `implementation-unit:${unit?.id ?? 'direct-reference'}`],
            confidence: 1, status: 'applied', skipReason: null,
          }, (candidate) => {
            const target = candidate.nodes.find((item) => item.id === node.id)!;
            if (!target.conceptualNodeIds.length) target.conceptualNodeIds = [source.id];
            if (!target.sourceReferences.length) target.sourceReferences = structuredClone(source.sourceReferences);
            if (!target.capabilityGroupIds.length) target.capabilityGroupIds = [...source.capabilityGroupIds];
            target.lifecycleStage = source.lifecycleStage;
            target.confidence = source.confidence;
          });
          current = result.graph;
          actions.push(result.action);
        }
        const metadata = metadataPatch(source, conceptual, node);
        if (metadata.fields.length) {
          const result = this.attemptPlatform(conceptual, current, {
            sourceIssueCode: 'CRITIC_CONTROL_METADATA_LOSS', repairKind: 'restore-control-metadata', repairSafety: 'safe',
            nodeIds: [node.id], edgeIds: [], beforeSummary: 'Translated control metadata is incomplete.',
            afterSummary: 'Existing conceptual control metadata restored exactly.', fieldsChanged: metadata.fields,
            sourceReferences: source.sourceReferences, evidence: metadata.evidence, confidence: 1, status: 'applied', skipReason: null,
          }, (candidate) => Object.assign(candidate.nodes.find((item) => item.id === node.id)!.configuration, structuredClone(metadata.patch)));
          current = result.graph;
          actions.push(result.action);
        } else if (requiresUnknownMetadata(source, node)) {
          actions.push(skipped('CRITIC_CONTROL_METADATA_LOSS', 'restore-control-metadata', [node.id], [], 'Control metadata is incomplete.', 'The conceptual graph does not contain an exact value; inventing one is prohibited.', source.sourceReferences));
        }
      } else if (!node.conceptualNodeIds.length) {
        actions.push(skipped('CRITIC_PLATFORM_TRACEABILITY_GAP', 'restore-traceability', [node.id], [], 'Translated node has no conceptual reference.', 'No unique implementation-unit mapping exists.', node.sourceReferences));
      }
    }

    for (const edge of [...current.edges].sort((a, b) => a.id.localeCompare(b.id))) {
      const sourceEdge = conceptual.edges.find((item) => edge.conceptualEdgeIds.includes(item.id)) ?? inferConceptualEdge(current, conceptual, edge.id);
      if (!sourceEdge) continue;
      const fields: string[] = [];
      if (!edge.conceptualEdgeIds.includes(sourceEdge.id)) fields.push('conceptualEdgeIds');
      if (!edge.sourceReferences.length) fields.push('sourceReferences');
      if (!edge.evidenceIds.length && sourceEdge.evidenceIds.length) fields.push('evidenceIds');
      if (!edge.label.trim() || /^(?:continue|default|route|branch)$/i.test(edge.label) || edge.label !== sourceEdge.label) fields.push('label');
      if (!fields.length) continue;
      const result = this.attemptPlatform(conceptual, current, {
        sourceIssueCode: fields.includes('label') ? 'CRITIC_BRANCH_LABEL_LOSS' : 'CRITIC_PLATFORM_TRACEABILITY_GAP',
        repairKind: fields.includes('label') ? 'restore-branch-label' : 'restore-traceability', repairSafety: 'safe',
        nodeIds: [], edgeIds: [edge.id], beforeSummary: 'Translated edge metadata differs from its conceptual source.',
        afterSummary: 'Exact conceptual edge metadata restored.', fieldsChanged: fields,
        sourceReferences: sourceEdge.sourceReferences, evidence: [`conceptual-edge:${sourceEdge.id}`, `label:${sourceEdge.label}`],
        confidence: 1, status: 'applied', skipReason: null,
      }, (candidate) => {
        const target = candidate.edges.find((item) => item.id === edge.id)!;
        if (!target.conceptualEdgeIds.includes(sourceEdge.id)) target.conceptualEdgeIds = [...target.conceptualEdgeIds, sourceEdge.id];
        if (!target.sourceReferences.length) target.sourceReferences = structuredClone(sourceEdge.sourceReferences);
        if (!target.evidenceIds.length) target.evidenceIds = [...sourceEdge.evidenceIds];
        target.label = sourceEdge.label;
      });
      current = result.graph;
      actions.push(result.action);
    }

    for (const node of [...current.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
      const conceptualId = node.conceptualNodeIds[0];
      const source = conceptual.nodes.find((item) => item.id === conceptualId);
      if (!source) continue;
      const needsUnsupported = node.configuration.unresolvedApplicationOperation === true;
      const needsLossy = node.primitiveType === 'canonical-continuation';
      const existing = current.warnings.some((warning) => warning.conceptualNodeIds.includes(source.id) && (
        needsUnsupported ? warning.kind === 'unsupported-feature' : needsLossy ? warning.kind === 'lossy-translation' || warning.kind === 'platform-limitation' : false
      ));
      if (!(needsUnsupported || needsLossy) || existing) continue;
      const warning = warningFor(current.selectedPlatform, source.id, needsUnsupported);
      const result = this.attemptPlatform(conceptual, current, {
        sourceIssueCode: needsUnsupported ? 'CRITIC_UNSUPPORTED_OPERATION_WITHOUT_WARNING' : 'CRITIC_LOSSY_TRANSLATION_WITHOUT_WARNING',
        repairKind: 'add-warning', repairSafety: 'safe', nodeIds: [node.id], edgeIds: [],
        beforeSummary: 'Known translation limitation has no structured warning.', afterSummary: 'Structured warning attached to the exact conceptual mapping.',
        fieldsChanged: ['warnings'], sourceReferences: source.sourceReferences, evidence: [warning.code, `conceptual-node:${source.id}`],
        confidence: 1, status: 'applied', skipReason: null,
      }, (candidate) => { candidate.warnings.push(warning); });
      current = result.graph;
      actions.push(result.action);
    }

    if (translationHasDuplicates(current)) {
      const result = this.attemptPlatform(conceptual, current, {
        sourceIssueCode: 'CANONICAL_DUPLICATE_REFERENCES', repairKind: 'canonical-normalization', repairSafety: 'safe',
        nodeIds: current.nodes.map((node) => node.id), edgeIds: current.edges.map((edge) => edge.id),
        beforeSummary: 'Translated metadata contains exact duplicate references or warnings.',
        afterSummary: 'Exact duplicates removed using stable first-occurrence ordering.',
        fieldsChanged: ['warnings', 'conceptualNodeIds', 'capabilityGroupIds', 'capabilityRefs', 'evidenceIds', 'sourceReferences', 'conceptualEdgeIds'],
        sourceReferences: [], evidence: ['stable exact-value deduplication'], confidence: 1, status: 'applied', skipReason: null,
      }, normalizeTranslation);
      current = result.graph;
      actions.push(result.action);
    }

    current = refreshDiagnostics(current);
    actions.push(...reviewOnlyActions(beforeCritique, actions));
    const afterCritique = this.critic.critiquePlatform(conceptual, current);
    const validation = platformValidation(current);
    return { graph: current, report: report('platform', current.selectedPlatform, actions, validation, beforeCritique, afterCritique) };
  }

  private attemptConceptual(current: V22ConceptualGraph, seed: ActionSeed, mutate: (candidate: V22ConceptualGraph) => void) {
    const candidate = structuredClone(current);
    mutate(candidate);
    const before = conceptualValidation(current);
    const after = conceptualValidation(candidate);
    const newFailures = [
      ...after.issues.filter((issue) => !before.issues.includes(issue)),
      ...this.validationGuard('conceptual', candidate),
    ];
    if (newFailures.length) return { graph: current, action: rollback(seed, newFailures) };
    return { graph: candidate, action: { ...seed, validation: after } };
  }

  private attemptPlatform(conceptual: V22ConceptualGraph, current: PlatformTranslationResult, seed: ActionSeed, mutate: (candidate: PlatformTranslationResult) => void) {
    const candidate = structuredClone(current);
    mutate(candidate);
    let refreshed: PlatformTranslationResult;
    try {
      refreshed = refreshDiagnostics(candidate);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'candidate diagnostics could not be refreshed';
      return { graph: current, action: rollback(seed, [message]) };
    }
    const before = platformValidation(current);
    const after = platformValidation(refreshed);
    const newFailures = [
      ...after.issues.filter((issue) => !before.issues.includes(issue)),
      ...this.validationGuard('platform', refreshed),
    ];
    if (newFailures.length) return { graph: current, action: rollback(seed, newFailures) };
    const beforeCritical = this.critic.critiquePlatform(conceptual, current).aggregate.errorCount;
    const afterCritical = this.critic.critiquePlatform(conceptual, refreshed).aggregate.errorCount;
    if (afterCritical > beforeCritical) return { graph: current, action: rollback(seed, ['repair introduced a new critical critique finding']) };
    return { graph: refreshed, action: { ...seed, validation: after } };
  }
}

function conceptualSource(v21: V21AnalysisArtifacts, graph: V22ConceptualGraph, nodeId: string) {
  const node = graph.nodes.find((item) => item.id === nodeId)!;
  const directGroups = v21.capabilityGroups.filter((group) => node.capabilityGroupIds.includes(group.id));
  const matchingGroups = directGroups.length ? directGroups : v21.capabilityGroups.filter((group) =>
    group.operationFactIds.some((id) => node.factIds.includes(id)) || group.evidenceIds.some((id) => node.evidenceIds.includes(id))
  );
  if (matchingGroups.length === 1) {
    const group = matchingGroups[0]!;
    return {
      references: group.sourceReferences, capabilityGroupIds: [group.id], factIds: group.operationFactIds, evidenceIds: group.evidenceIds,
      fields: ['sourceReferences', 'capabilityGroupIds', 'factIds', 'evidenceIds'],
      evidence: [`capability-group:${group.id}`],
    };
  }
  const incident = graph.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId).flatMap((edge) => edge.sourceReferences);
  const references = dedupe(incident, sourceKey);
  if (!references.length) return null;
  return { references, capabilityGroupIds: node.capabilityGroupIds, factIds: node.factIds, evidenceIds: node.evidenceIds, fields: ['sourceReferences'], evidence: ['incident-edge source references'] };
}

function metadataPatch(source: V22ConceptualGraph['nodes'][number], graph: V22ConceptualGraph, translated: PlatformTranslationResult['nodes'][number]) {
  const patch: Record<string, unknown> = {};
  const fields: string[] = [];
  const evidence: string[] = [];
  if (source.role === 'collection-iterator' && source.collectionSource && translated.configuration.collectionSource !== source.collectionSource) {
    patch.collectionSource = source.collectionSource; fields.push('configuration.collectionSource'); evidence.push(`collectionSource:${source.collectionSource}`);
  }
  if (source.role === 'item-aggregator') {
    const inputs = graph.edges.filter((edge) => edge.target === source.id && (edge.role === 'item-result' || edge.role === 'iteration-complete')).map((edge) => edge.id);
    if (inputs.length && JSON.stringify(translated.configuration.aggregationInputEdgeIds) !== JSON.stringify(inputs)) {
      patch.aggregationInputEdgeIds = inputs; fields.push('configuration.aggregationInputEdgeIds'); evidence.push(...inputs.map((id) => `aggregation-input:${id}`));
    }
  }
  if (source.role === 'technical-retry' && source.retry && JSON.stringify(translated.configuration.retry) !== JSON.stringify(source.retry)) {
    patch.retry = source.retry; patch.maximumAttempts = source.retry.maximumAttempts; patch.backoff = source.retry.backoff;
    fields.push('configuration.retry', 'configuration.maximumAttempts', 'configuration.backoff'); evidence.push(`retry:${JSON.stringify(source.retry)}`);
  }
  if ((source.role === 'event-wait' || source.role === 'delay-boundary') && source.wait) {
    if (JSON.stringify(translated.configuration.wait) !== JSON.stringify(source.wait)) { patch.wait = source.wait; fields.push('configuration.wait'); }
    if (source.wait.resumeCondition && translated.configuration.resumeCondition !== source.wait.resumeCondition) { patch.resumeCondition = source.wait.resumeCondition; fields.push('configuration.resumeCondition'); }
    if (source.wait.correlationIdentifier && translated.configuration.correlationIdentifier !== source.wait.correlationIdentifier) { patch.correlationIdentifier = source.wait.correlationIdentifier; fields.push('configuration.correlationIdentifier'); }
    evidence.push(`wait:${JSON.stringify(source.wait)}`);
  }
  if (source.role === 'loop-until' || source.role === 'business-loop') {
    const loopBack = graph.edges.filter((edge) => edge.target === source.id && edge.role === 'loop-back').map((edge) => edge.id);
    const loopExit = graph.edges.filter((edge) => edge.source === source.id && edge.role === 'loop-exit').map((edge) => edge.id);
    if (loopBack.length && JSON.stringify(translated.configuration.loopBackEdgeIds) !== JSON.stringify(loopBack)) { patch.loopBackEdgeIds = loopBack; fields.push('configuration.loopBackEdgeIds'); }
    if (loopExit.length && JSON.stringify(translated.configuration.loopExitEdgeIds) !== JSON.stringify(loopExit)) { patch.loopExitEdgeIds = loopExit; fields.push('configuration.loopExitEdgeIds'); }
    evidence.push(...loopBack.map((id) => `loop-back:${id}`), ...loopExit.map((id) => `loop-exit:${id}`));
  }
  if (translated.primitiveType === 'canonical-continuation' && translated.configuration.continuationBoundary !== true) {
    patch.continuationBoundary = true; fields.push('configuration.continuationBoundary'); evidence.push('canonical-continuation primitive');
  }
  return { patch, fields, evidence: evidence.length ? evidence : [`conceptual-node:${source.id}`] };
}

function requiresUnknownMetadata(source: V22ConceptualGraph['nodes'][number], translated: PlatformTranslationResult['nodes'][number]) {
  return (source.role === 'collection-iterator' && !source.collectionSource && !translated.configuration.collectionSource)
    || (source.role === 'event-wait' && !source.wait?.correlationIdentifier && !translated.configuration.correlationIdentifier);
}

function inferConceptualEdge(translation: PlatformTranslationResult, conceptual: V22ConceptualGraph, translatedEdgeId: string) {
  const edge = translation.edges.find((item) => item.id === translatedEdgeId)!;
  const sourceUnit = translation.units.find((unit) => unit.implementationNodeIds.includes(edge.source));
  const targetUnit = translation.units.find((unit) => unit.implementationNodeIds.includes(edge.target));
  const candidates = conceptual.edges.filter((item) => sourceUnit?.conceptualNodeIds.includes(item.source) && targetUnit?.conceptualNodeIds.includes(item.target));
  return candidates.length === 1 ? candidates[0] : undefined;
}

function warningFor(platform: PlatformTranslationResult['selectedPlatform'], conceptualId: string, unsupported: boolean): TranslationWarning {
  return {
    code: `${platform.toUpperCase()}_${unsupported ? 'OPERATION_UNRESOLVED' : 'LOSSY_CONTINUATION'}`,
    severity: 'warning',
    kind: unsupported ? 'unsupported-feature' : 'lossy-translation',
    message: unsupported ? 'The exact application operation is unresolved and was not invented.' : 'A canonical continuation preserves behavior that has no exact verified platform primitive.',
    conceptualNodeIds: [conceptualId],
    capabilityRefs: [],
  };
}

function normalizeTranslation(candidate: PlatformTranslationResult) {
  candidate.warnings = dedupe(candidate.warnings, warningKey);
  for (const node of candidate.nodes) {
    node.conceptualNodeIds = dedupe(node.conceptualNodeIds);
    node.capabilityGroupIds = dedupe(node.capabilityGroupIds);
    node.capabilityRefs = dedupe(node.capabilityRefs);
    node.evidenceIds = dedupe(node.evidenceIds);
    node.sourceReferences = dedupe(node.sourceReferences, sourceKey);
  }
  for (const edge of candidate.edges) {
    edge.conceptualEdgeIds = dedupe(edge.conceptualEdgeIds);
    edge.evidenceIds = dedupe(edge.evidenceIds);
    edge.sourceReferences = dedupe(edge.sourceReferences, sourceKey);
  }
}

function translationHasDuplicates(value: PlatformTranslationResult) {
  return hasDuplicates(value.warnings, warningKey)
    || value.nodes.some((node) => hasDuplicates(node.conceptualNodeIds) || hasDuplicates(node.capabilityGroupIds) || hasDuplicates(node.capabilityRefs) || hasDuplicates(node.evidenceIds) || hasDuplicates(node.sourceReferences, sourceKey))
    || value.edges.some((edge) => hasDuplicates(edge.conceptualEdgeIds) || hasDuplicates(edge.evidenceIds) || hasDuplicates(edge.sourceReferences, sourceKey));
}

function refreshDiagnostics(value: PlatformTranslationResult): PlatformTranslationResult {
  const candidate = structuredClone(value);
  const validation = selectedValidation(candidate);
  candidate.diagnostics = {
    conceptualNodeCount: candidate.units.length,
    translatedNodeCount: candidate.nodes.length,
    translatedEdgeCount: candidate.edges.length,
    unsupportedFeatureCount: candidate.warnings.filter((warning) => warning.kind === 'unsupported-feature').length,
    lossyTranslationCount: candidate.warnings.filter((warning) => warning.kind === 'lossy-translation').length,
    platformLeakageCount: validation.platformLeakageCount,
    invalidOperationReferenceCount: validation.invalidOperationReferenceCount,
    valid: validation.valid,
  };
  return platformTranslationResultSchema.parse(candidate);
}

function selectedValidation(value: PlatformTranslationResult) {
  return value.selectedPlatform === 'n8n' ? validateN8nTranslation(value) : value.selectedPlatform === 'make' ? validateMakeTranslation(value) : validateZapierTranslation(value);
}

function conceptualValidation(graph: V22ConceptualGraph) {
  const schema = v22ConceptualGraphSchema.safeParse(graph);
  const issues = [...(schema.success ? [] : schema.error.issues.map((issue) => `schema:${issue.path.join('.')}:${issue.message}`)), ...validateV22ConceptualGraph(graph).map((issue) => `${issue.code}:${issue.nodeId ?? ''}:${issue.edgeId ?? ''}`)];
  return { valid: issues.length === 0, issues };
}

function platformValidation(graph: PlatformTranslationResult) {
  const schema = platformTranslationResultSchema.safeParse(graph);
  const validation = selectedValidation(graph);
  const issues = [...(schema.success ? [] : schema.error.issues.map((issue) => `schema:${issue.path.join('.')}:${issue.message}`)), ...validation.warnings.filter((warning) => warning.severity === 'error').map((warning) => warning.code)];
  return { valid: issues.length === 0, issues };
}

function report(graphKind: 'conceptual' | 'platform', platform: PlatformTranslationResult['selectedPlatform'] | null, actions: GraphRepairAction[], validation: { valid: boolean; issues: string[] }, beforeCritique: GraphCritique, afterCritique: GraphCritique): GraphRepairReport {
  return graphRepairReportSchema.parse({
    version: '2.4B', shadowMode: true, graphKind, platform, actions, validation,
    remainingReviewRequiredIssues: afterCritique.issues.filter((issue) => issue.repairSafety !== 'safe'),
    beforeCritique, afterCritique,
  });
}

function reviewOnlyActions(critique: GraphCritique, existing: GraphRepairAction[]) {
  const handled = new Set(existing.map((action) => action.sourceIssueCode));
  return critique.issues.filter((issue) => !handled.has(issue.code) && !eligible(issue.code)).map((issue) =>
    skipped(issue.code, mapRepairKind(issue), issue.nodeIds, issue.edgeIds, issue.explanation, 'This finding can change business meaning or requires missing information and remains review-required.', issue.sourceReferences)
  );
}

function eligible(code: string) {
  return code.includes('TRACEABILITY') || code === 'CRITIC_BRANCH_LABEL_LOSS' || code === 'CRITIC_CONTROL_METADATA_LOSS' || code === 'CRITIC_UNSUPPORTED_OPERATION_WITHOUT_WARNING' || code === 'CRITIC_LOSSY_TRANSLATION_WITHOUT_WARNING';
}

function mapRepairKind(issue: GraphCritiqueIssue): GraphRepairAction['repairKind'] {
  if (issue.suggestedRepairKind === 'preserve-branch-label') return 'restore-branch-label';
  if (issue.suggestedRepairKind === 'preserve-metadata') return 'restore-control-metadata';
  if (issue.suggestedRepairKind === 'add-warning') return 'add-warning';
  return 'canonical-normalization';
}

function skipped(code: string, kind: GraphRepairAction['repairKind'], nodeIds: string[], edgeIds: string[], before: string, reason: string, sourceReferences: SourceReference[]): GraphRepairAction {
  return {
    sourceIssueCode: code, repairKind: kind, repairSafety: 'review-required', nodeIds, edgeIds,
    beforeSummary: before, afterSummary: 'No automatic change applied.', fieldsChanged: [], sourceReferences,
    evidence: [reason], confidence: 1, status: 'skipped', skipReason: reason,
    validation: { valid: true, issues: [] },
  };
}

function rollback(seed: ActionSeed, issues: string[]): GraphRepairAction {
  return { ...seed, status: 'skipped', repairSafety: 'safe', afterSummary: 'Repair rolled back atomically.', fieldsChanged: [], skipReason: `Repair introduced validation failures: ${issues.join(', ')}`, validation: { valid: false, issues } };
}

function dedupe<T>(values: T[], key: (value: T) => string = (value) => String(value)): T[] {
  return [...new Map(values.map((value) => [key(value), value])).values()];
}

function hasDuplicates<T>(values: T[], key: (value: T) => string = (value) => String(value)) {
  return new Set(values.map(key)).size !== values.length;
}

function sourceKey(value: SourceReference) {
  return `${value.segmentId}:${value.stepId}:${value.start}:${value.end}:${value.text}`;
}

function warningKey(value: TranslationWarning) {
  return `${value.code}:${value.kind}:${value.message}:${[...value.conceptualNodeIds].sort().join(',')}:${[...value.capabilityRefs].sort().join(',')}`;
}
