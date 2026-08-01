import {
  CANONICAL_WORKFLOW_BRIEF_SCHEMA_VERSION,
  parseCanonicalWorkflowBrief,
  type CanonicalWorkflowBrief,
  type WorkflowBriefActor,
  type WorkflowBriefApproval,
  type WorkflowBriefCapabilitySuggestion,
  type WorkflowBriefClarificationQuestion,
  type WorkflowBriefConfidence,
  type WorkflowBriefDecision,
  type WorkflowBriefEvidence,
  type WorkflowBriefReviewDecision,
  type WorkflowBriefRoute,
  type WorkflowBriefWait,
} from '@awm/shared';
import {
  ApprovalDetector,
  BinaryDecisionDetector,
  RouterDetector,
  WaitDetector,
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

function mergeCapabilityDetections(sourceRequirement: string): CapabilityDetectionResult[] {
  const approval = new ApprovalDetector().detect({ sourceRequirement });
  const wait = new WaitDetector().detect({ sourceRequirement });
  const router = new RouterDetector().detect({ sourceRequirement });
  const binary = new BinaryDecisionDetector().detect({ sourceRequirement });
  const approvalScopes = new Set(approval.candidates.map(candidateScope));
  const routerScopes = new Set(router.candidates.map(candidateScope));
  return [
    approval,
    { ...wait, candidates: wait.candidates.filter((candidate) =>
      !approvalScopes.has(candidateScope(candidate)) || candidate.metadata?.explicitResumeBoundary === 'true') },
    router,
    { ...binary, candidates: binary.candidates.filter((candidate) => !routerScopes.has(candidateScope(candidate))) },
  ];
}

function waitFor(candidate: CapabilityDetectionCandidate, resumeActionId: string): WorkflowBriefWait | undefined {
  const hint = candidate.relatedEntityHints.find((item) => item.entityType === 'wait');
  const waitType = candidate.metadata?.waitType as WorkflowBriefWait['waitType'] | undefined;
  const boundary = candidate.metadata?.boundaryDescription;
  if (!hint || !waitType || !boundary || candidate.ambiguityIds.length) return undefined;
  return {
    id: hint.temporaryId,
    name: candidate.name,
    description: candidate.explanation,
    waitType,
    boundaryDescription: boundary,
    resumeActionId,
    ...(waitType === 'duration' ? { durationDescription: candidate.metadata?.durationDescription ?? boundary } : {}),
    ...(waitType === 'until-date' ? { dateDescription: boundary } : {}),
    ...(['until-event', 'until-response', 'until-approval'].includes(waitType) ? { eventDescription: boundary } : {}),
  };
}

function approvalFor(candidate: CapabilityDetectionCandidate, requestActionId: string): {
  actor?: WorkflowBriefActor;
  approval?: WorkflowBriefApproval;
  decision?: WorkflowBriefDecision;
  routes: WorkflowBriefRoute[];
} {
  const approvalHint = candidate.relatedEntityHints.find((item) => item.entityType === 'approval');
  const actorHint = candidate.relatedEntityHints.find((item) => item.entityType === 'actor');
  const decisionHint = candidate.relatedEntityHints.find((item) => item.entityType === 'decision');
  const routeHints = candidate.relatedEntityHints.filter((item) => item.entityType === 'route');
  const subject = candidate.metadata?.approvalSubject;
  const approver = candidate.metadata?.approverRole;
  if (!approvalHint || !actorHint || !decisionHint || routeHints.length !== 2 || !subject || !approver || candidate.metadata?.outcomeHints !== 'Approved | Rejected' || candidate.ambiguityIds.length) return { routes: [] };
  const routes: WorkflowBriefRoute[] = [
    { id: routeHints[0]!.temporaryId, decisionId: decisionHint.temporaryId, label: 'Approved', condition: `${subject} is approved`, outcomeDescription: routeHints[0]!.description, isFallback: false },
    { id: routeHints[1]!.temporaryId, decisionId: decisionHint.temporaryId, label: 'Rejected', condition: `${subject} is rejected`, outcomeDescription: routeHints[1]!.description, isFallback: true },
  ];
  return {
    actor: { id: actorHint.temporaryId, name: approver, role: 'Approver', description: actorHint.description },
    decision: { id: decisionHint.temporaryId, name: `Decide approval for ${subject}`, description: decisionHint.description, decisionType: 'binary', conditionDescription: `${approver} approves or rejects ${subject}`, routeIds: routes.map((route) => route.id), fallbackRouteId: routes[1]!.id },
    routes,
    approval: { id: approvalHint.temporaryId, name: `Approval for ${subject}`, description: `Request an active human approval decision from ${approver} for ${subject}.`, approverActorId: actorHint.temporaryId, requestActionId, approvedRouteId: routes[0]!.id, rejectedRouteId: routes[1]!.id },
  };
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

  const suffix = stableHash(sourceRequirement);
  const draftReviewActionId = `draft-requirement-review-${suffix}`;
  const detections = mergeCapabilityDetections(sourceRequirement);
  const candidates = detections.flatMap((result) => result.candidates.map((candidate) => ({ result, candidate })));
  const evidence: WorkflowBriefEvidence[] = [];
  const confidence: WorkflowBriefConfidence[] = [];
  const clarificationQuestions: WorkflowBriefClarificationQuestion[] = [];
  const reviewDecisions: WorkflowBriefReviewDecision[] = [];
  const capabilitySuggestions: WorkflowBriefCapabilitySuggestion[] = [];
  const decisions: WorkflowBriefDecision[] = [];
  const routes: WorkflowBriefRoute[] = [];
  const actors: WorkflowBriefActor[] = [];
  const waits: WorkflowBriefWait[] = [];
  const approvals: WorkflowBriefApproval[] = [];

  for (const { result, candidate } of candidates) {
    const materializedEntityIds: string[] = [];
    if (candidate.nodeFunctionId === 'router' || candidate.nodeFunctionId === 'binary-decision') {
      const entities = entitiesFor(candidate);
      if (entities.decision) {
        decisions.push(entities.decision);
        routes.push(...entities.routes);
        materializedEntityIds.push(entities.decision.id, ...entities.routes.map((route) => route.id));
      }
    } else if (candidate.nodeFunctionId === 'wait') {
      const wait = waitFor(candidate, draftReviewActionId);
      if (wait) {
        waits.push(wait);
        materializedEntityIds.push(wait.id);
      }
    } else if (candidate.nodeFunctionId === 'approval') {
      const entities = approvalFor(candidate, draftReviewActionId);
      if (entities.actor && entities.approval && entities.decision) {
        actors.push(entities.actor);
        approvals.push(entities.approval);
        decisions.push(entities.decision);
        routes.push(...entities.routes);
        materializedEntityIds.push(entities.actor.id, entities.approval.id, entities.decision.id, ...entities.routes.map((route) => route.id));
      }
    }
    const preview = previewWorkflowBriefDetectionMetadata(result, candidate.id);
    evidence.push(...preview.evidence);
    confidence.push(preview.confidence);
    clarificationQuestions.push(...preview.clarificationQuestions);
    reviewDecisions.push(preview.reviewDecision);
    if (preview.capabilitySuggestion) capabilitySuggestions.push({ ...preview.capabilitySuggestion, relatedEntityIds: materializedEntityIds });
  }

  const needsClarification = clarificationQuestions.some((question) =>
    question.status === 'open' && ['high', 'blocking'].includes(question.priority));
  return parseCanonicalWorkflowBrief({
    schemaVersion: CANONICAL_WORKFLOW_BRIEF_SCHEMA_VERSION,
    id: `draft-workflow-brief-${suffix}`,
    name: input.name?.trim() || 'Draft workflow brief',
    summary: input.summary?.trim() || 'Draft business workflow requirements assembled for review.',
    objective: input.objective?.trim() || 'Review and refine the detected business workflow requirements.',
    sourceRequirement,
    actors,
    applications: [],
    triggers: [{
      id: `draft-requirement-intake-${suffix}`,
      name: 'Draft requirement intake',
      description: 'Draft scaffolding representing receipt of the requirement for review; not an extracted client trigger.',
      triggerType: 'manual',
    }],
    actions: [{
      id: draftReviewActionId,
      name: 'Review and refine detected workflow requirements',
      description: 'Draft scaffolding for human refinement; not an extracted client action.',
      inputs: ['Raw business requirement'],
      outputs: ['Reviewed business requirement'],
    }],
    routes,
    decisions,
    loops: [],
    waits,
    approvals,
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
