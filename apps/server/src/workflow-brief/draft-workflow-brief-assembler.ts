import {
  CANONICAL_WORKFLOW_BRIEF_SCHEMA_VERSION,
  parseCanonicalWorkflowBrief,
  type CanonicalWorkflowBrief,
  type WorkflowBriefCapabilitySuggestion,
  type WorkflowBriefClarificationQuestion,
  type WorkflowBriefConfidence,
  type WorkflowBriefDecision,
  type WorkflowBriefEvidence,
  type WorkflowBriefReviewDecision,
  type WorkflowBriefRoute,
} from '@awm/shared';
import {
  BinaryDecisionDetector,
  RouterDetector,
  previewWorkflowBriefDetectionMetadata,
  type CapabilityDetectionCandidate,
  type CapabilityDetectionResult,
} from '@awm/knowledge';

export interface AssembleDraftWorkflowBriefInput {
  sourceRequirement: string;
  name?: string | undefined;
  summary?: string | undefined;
  objective?: string | undefined;
}

const stableHash = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const candidateScope = (candidate: CapabilityDetectionCandidate): string =>
  candidate.metadata?.scope ?? candidate.evidenceIds.join('|');

function mergeDecisionDetections(sourceRequirement: string): CapabilityDetectionResult[] {
  const router = new RouterDetector().detect({ sourceRequirement });
  const binary = new BinaryDecisionDetector().detect({ sourceRequirement });
  const routerScopes = new Set(router.candidates.map(candidateScope));
  return [
    router,
    { ...binary, candidates: binary.candidates.filter((candidate) => !routerScopes.has(candidateScope(candidate))) },
  ];
}

const labelsFor = (candidate: CapabilityDetectionCandidate): string[] =>
  (candidate.metadata?.routeLabels ?? '')
    .split('|')
    .map((label) => label.trim())
    .filter(Boolean);

function entitiesFor(candidate: CapabilityDetectionCandidate): {
  decision?: WorkflowBriefDecision;
  routes: WorkflowBriefRoute[];
} {
  const decisionHint = candidate.relatedEntityHints.find((hint) => hint.entityType === 'decision');
  const routeHints = candidate.relatedEntityHints.filter((hint) => hint.entityType === 'route');
  const labels = labelsFor(candidate);
  if (!decisionHint || labels.length !== routeHints.length || labels.length < 2) return { routes: [] };
  const routingBasis = candidate.metadata?.routingBasis;
  const routingBasisIsKnown = Boolean(
    routingBasis
    && routingBasis !== 'an unresolved business attribute'
    && !candidate.ambiguityIds.some((id) => id.includes('basis-ambiguity')),
  );

  const routes = routeHints.map((hint, index): WorkflowBriefRoute => ({
    id: hint.temporaryId,
    decisionId: decisionHint.temporaryId,
    label: labels[index]!,
    condition: candidate.nodeFunctionId === 'binary-decision'
      ? `${candidate.metadata?.condition ?? candidate.name} is ${labels[index]}`
      : routingBasisIsKnown
        ? `${routingBasis!} matches ${labels[index]}`
        : `Condition requires clarification for the ${labels[index]} outcome`,
    outcomeDescription: hint.description,
    isFallback: candidate.nodeFunctionId === 'binary-decision' && index === 1,
  }));
  const fallbackRouteId = candidate.nodeFunctionId === 'binary-decision' ? routes[1]?.id : undefined;
  const decision: WorkflowBriefDecision = {
    id: decisionHint.temporaryId,
    name: candidate.name,
    description: decisionHint.description,
    decisionType: candidate.nodeFunctionId === 'router' ? 'multi-route' : 'binary',
    conditionDescription: candidate.metadata?.condition
      ?? (routingBasisIsKnown ? routingBasis! : 'Routing condition requires clarification'),
    routeIds: routes.map((route) => route.id),
    ...(fallbackRouteId ? { fallbackRouteId } : {}),
  };
  return { decision, routes };
}

export function assembleDraftWorkflowBrief(input: AssembleDraftWorkflowBriefInput): CanonicalWorkflowBrief {
  const sourceRequirement = input.sourceRequirement.trim();
  if (!sourceRequirement) throw new Error('sourceRequirement must not be empty.');

  const detections = mergeDecisionDetections(sourceRequirement);
  const candidates = detections.flatMap((result) => result.candidates.map((candidate) => ({ result, candidate })));
  const evidence: WorkflowBriefEvidence[] = [];
  const confidence: WorkflowBriefConfidence[] = [];
  const clarificationQuestions: WorkflowBriefClarificationQuestion[] = [];
  const reviewDecisions: WorkflowBriefReviewDecision[] = [];
  const capabilitySuggestions: WorkflowBriefCapabilitySuggestion[] = [];
  const decisions: WorkflowBriefDecision[] = [];
  const routes: WorkflowBriefRoute[] = [];

  for (const { result, candidate } of candidates) {
    const entities = entitiesFor(candidate);
    if (!entities.decision) continue;
    decisions.push(entities.decision);
    routes.push(...entities.routes);
    const preview = previewWorkflowBriefDetectionMetadata(result, candidate.id);
    evidence.push(...preview.evidence);
    confidence.push(preview.confidence);
    clarificationQuestions.push(...preview.clarificationQuestions);
    reviewDecisions.push(preview.reviewDecision);
    if (preview.capabilitySuggestion) capabilitySuggestions.push(preview.capabilitySuggestion);
  }

  const needsClarification = clarificationQuestions.some((question) =>
    question.status === 'open' && ['high', 'blocking'].includes(question.priority));
  const suffix = stableHash(sourceRequirement);
  return parseCanonicalWorkflowBrief({
    schemaVersion: CANONICAL_WORKFLOW_BRIEF_SCHEMA_VERSION,
    id: `draft-workflow-brief-${suffix}`,
    name: input.name?.trim() || 'Draft workflow brief',
    summary: input.summary?.trim() || 'Draft business workflow requirements assembled for review.',
    objective: input.objective?.trim() || 'Review and refine the detected business workflow requirements.',
    sourceRequirement,
    actors: [],
    applications: [],
    triggers: [{
      id: `draft-requirement-intake-${suffix}`,
      name: 'Draft requirement intake',
      description: 'Draft scaffolding representing receipt of the requirement for review; not an extracted client trigger.',
      triggerType: 'manual',
    }],
    actions: [{
      id: `draft-requirement-review-${suffix}`,
      name: 'Review and refine detected workflow requirements',
      description: 'Draft scaffolding for human refinement; not an extracted client action.',
      inputs: ['Raw business requirement'],
      outputs: ['Reviewed business requirement'],
    }],
    routes,
    decisions,
    loops: [],
    waits: [],
    approvals: [],
    merges: [],
    iterators: [],
    aggregators: [],
    evidence,
    confidence,
    clarificationQuestions,
    reviewDecisions,
    capabilitySuggestions,
    reviewState: {
      status: needsClarification ? 'needs-clarification' : 'draft',
      version: 1,
      notes: ['Generated by the isolated internal Workflow Brief vertical slice for review.'],
    },
    assumptions: ['A draft requirement-intake boundary and review action are included only to satisfy minimum brief structure.'],
    missingInformation: clarificationQuestions.map((question) => question.question),
    warnings: ['Draft trigger and action are scaffolding and must not be treated as extracted client requirements.'],
    completionCriteria: ['A reviewer has refined the draft and resolved all blocking or high-priority clarification questions.'],
  });
}
