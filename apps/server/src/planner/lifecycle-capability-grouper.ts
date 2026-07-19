import {
  lifecycleCapabilityGroupSchema,
  type DetectedProcessFact,
  type DetectedProcessSummary,
  type LifecycleCapabilityGroup,
  type NormalizedRequirementAnalysis,
  type RequirementSourceReference,
} from '@awm/shared';

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
const title = (value: string) => value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const operationValues = new Set(['action', 'data-retrieval', 'notification', 'logging', 'validation', 'human-approval', 'delay', 'retry', 'error-handler']);

interface Operation {
  fact: DetectedProcessFact;
  reference: RequirementSourceReference;
  entity: string | null;
  stage: string | null;
}

export class LifecycleCapabilityGrouper {
  public group(analysis: DetectedProcessSummary, normalized: NormalizedRequirementAnalysis): LifecycleCapabilityGroup[] {
    const segments = new Map((analysis.segments ?? []).map((segment) => [segment.id, segment]));
    const operations: Operation[] = analysis.facts.flatMap((fact) => {
      if (fact.kind !== 'business_verb' && !(fact.kind === 'workflow_function' && operationValues.has(fact.value))) return [];
      const segment = fact.subject?.segmentId ? segments.get(fact.subject.segmentId) : undefined;
      if (!segment) return [];
      const reference = { segmentId: segment.id, stepId: segment.stepId, start: segment.start, end: segment.end, text: segment.text };
      const entity = fact.subject?.entityId ?? analysis.facts.find((candidate) => candidate.kind === 'entity' && candidate.subject?.stepId === segment.stepId)?.value ?? null;
      const stage = normalized.lifecycleStages.find((candidate) => candidate.sourceReferences.some((ref) => ref.stepId === segment.stepId))?.value ?? null;
      return [{ fact, reference, entity, stage }];
    });

    const groups = new Map<string, Operation[]>();
    for (const operation of operations) {
      const key = operation.stage
        ? `stage:${slug(operation.stage)}:${operation.entity ?? 'general'}`
        : operation.entity
          ? `entity:${slug(operation.entity)}:${operation.reference.stepId}`
          : `step:${operation.reference.stepId}`;
      groups.set(key, [...(groups.get(key) ?? []), operation]);
    }

    return [...groups.entries()].map(([key, members], index) => {
      const references = [...new Map(members.map((item) => [item.reference.segmentId, item.reference])).values()];
      const entity = members.find((item) => item.entity)?.entity ?? null;
      const stage = members.find((item) => item.stage)?.stage ?? null;
      const verbs = [...new Set(members.filter((item) => item.fact.kind === 'business_verb').map((item) => item.fact.value))];
      const functions = [...new Set(members.filter((item) => item.fact.kind === 'workflow_function').map((item) => item.fact.value))];
      const purpose = stage
        ? `${title(stage)} ${entity ? title(entity) : 'Process'}`
        : entity && verbs.length
          ? `${title(verbs[0]!)} ${title(entity)}`
          : title(functions[0] ?? verbs[0] ?? 'Business Operation');
      const evidenceIds = [...new Set(members.flatMap((item) => item.fact.evidence.map((evidence) => evidence.id)))];
      const averageConfidence = members.reduce((sum, item) => sum + item.fact.confidence.finalConfidence, 0) / Math.max(1, members.length);
      return lifecycleCapabilityGroupSchema.parse({
        id: `capability-${slug(key)}-${index + 1}`,
        title: purpose,
        purpose: `Perform ${[...verbs, ...functions].map(title).join(', ')} as one traceable business capability.`,
        entity,
        lifecycleStage: stage,
        outcome: null,
        operationFactIds: [...new Set(members.map((item) => item.fact.id))],
        evidenceIds,
        sourceReferences: references,
        underlyingOperations: members.map((item) => ({ factId: item.fact.id, operation: item.fact.value, sourceReference: item.reference })),
        confidence: Number(averageConfidence.toFixed(4)),
        rationale: members.length > 1
          ? `Grouped ${members.length} related operations because they share ${stage ? `the ${stage} lifecycle stage` : entity ? `the ${entity} entity and requirement step` : 'one requirement step'}; no unrelated step was merged.`
          : 'Preserved as a standalone capability because no deterministically related operation shares its entity, lifecycle stage, and source step.',
      });
    });
  }
}
