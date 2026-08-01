import { z } from 'zod';

export const CANONICAL_WORKFLOW_BRIEF_SCHEMA_VERSION = '1.0' as const;

const idSchema = z.string().trim().min(1, 'ID must not be empty.');
const nameSchema = z.string().trim().min(1, 'Name must not be empty.');
const textSchema = z.string().trim().min(1);

export const workflowBriefActorSchema = z.object({
  id: idSchema,
  name: nameSchema,
  role: textSchema,
  description: textSchema.optional(),
}).strict();

export const workflowBriefApplicationSchema = z.object({
  id: idSchema,
  name: nameSchema,
  purpose: textSchema.optional(),
  explicitlyMentioned: z.boolean(),
}).strict();

export const workflowBriefTriggerTypeSchema = z.enum([
  'manual',
  'schedule',
  'event',
  'webhook',
  'form',
  'message',
  'file',
  'record-change',
  'other',
]);

export const workflowBriefTriggerSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: textSchema,
  applicationId: idSchema.optional(),
  triggerType: workflowBriefTriggerTypeSchema,
}).strict();

export const workflowBriefActionSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: textSchema,
  applicationId: idSchema.optional(),
  actorId: idSchema.optional(),
  inputs: z.array(textSchema),
  outputs: z.array(textSchema),
}).strict();

export const workflowBriefDecisionTypeSchema = z.enum(['binary', 'multi-route']);
export const workflowBriefDecisionSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: textSchema,
  decisionType: workflowBriefDecisionTypeSchema,
  conditionDescription: textSchema,
  routeIds: z.array(idSchema).min(2),
  fallbackRouteId: idSchema.optional(),
}).strict().superRefine((decision, context) => {
  if (new Set(decision.routeIds).size !== decision.routeIds.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Decision route IDs must be unique.', path: ['routeIds'] });
  if (decision.decisionType === 'binary' && decision.routeIds.length !== 2) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A binary decision must reference exactly two routes.', path: ['routeIds'] });
  if (decision.fallbackRouteId && !decision.routeIds.includes(decision.fallbackRouteId)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'The fallback route must belong to the decision.', path: ['fallbackRouteId'] });
});

const genericRouteLabel = /^(?:output|route|branch|path)\s*\d+$/i;
export const workflowBriefRouteSchema = z.object({
  id: idSchema,
  decisionId: idSchema,
  label: nameSchema.refine((label) => !genericRouteLabel.test(label), 'Route labels must describe a business outcome.'),
  condition: textSchema,
  outcomeDescription: textSchema,
  targetActionId: idSchema.optional(),
  isFallback: z.boolean(),
}).strict();

export const workflowBriefLoopTypeSchema = z.enum(['collection', 'bounded-retry', 'follow-up', 'revision', 'polling', 'return-to-step']);
export const workflowBriefLoopSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: textSchema,
  loopType: workflowBriefLoopTypeSchema,
  entryActionId: idSchema,
  bodyActionIds: z.array(idSchema).min(1),
  exitCondition: textSchema,
  loopBackActionId: idSchema.optional(),
  maximumIterations: z.number().int().positive().optional(),
  intervalDescription: textSchema.optional(),
}).strict().superRefine((loop, context) => {
  if (loop.loopType === 'bounded-retry' && loop.maximumIterations === undefined) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A bounded retry requires maximumIterations.', path: ['maximumIterations'] });
  if (loop.loopType === 'return-to-step' && !loop.loopBackActionId) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A return-to-step loop requires loopBackActionId.', path: ['loopBackActionId'] });
  if (loop.loopType === 'polling' && !loop.intervalDescription) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A polling loop requires intervalDescription.', path: ['intervalDescription'] });
});

export const workflowBriefWaitTypeSchema = z.enum(['duration', 'until-date', 'until-event', 'until-response', 'until-approval']);
export const workflowBriefWaitSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: textSchema,
  waitType: workflowBriefWaitTypeSchema,
  boundaryDescription: textSchema,
  resumeActionId: idSchema,
  durationDescription: textSchema.optional(),
  dateDescription: textSchema.optional(),
  eventDescription: textSchema.optional(),
}).strict().superRefine((wait, context) => {
  if (wait.waitType === 'duration' && !wait.durationDescription) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A duration wait requires durationDescription.', path: ['durationDescription'] });
  if (wait.waitType === 'until-date' && !wait.dateDescription) context.addIssue({ code: z.ZodIssueCode.custom, message: 'An until-date wait requires dateDescription.', path: ['dateDescription'] });
  if (['until-event', 'until-response', 'until-approval'].includes(wait.waitType) && !wait.eventDescription) context.addIssue({ code: z.ZodIssueCode.custom, message: `${wait.waitType} requires eventDescription.`, path: ['eventDescription'] });
});

const activeApprovalLanguage = /\b(?:request|require|await|seek|obtain|review|approv(?:e|es|ing)|reject|authorize|authorise|consent|human decision)\b/i;
export const workflowBriefApprovalSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: textSchema,
  approverActorId: idSchema.optional(),
  requestActionId: idSchema,
  approvedRouteId: idSchema,
  rejectedRouteId: idSchema,
  timeoutRouteId: idSchema.optional(),
  approvalCriteria: textSchema.optional(),
}).strict().superRefine((approval, context) => {
  if (approval.approvedRouteId === approval.rejectedRouteId) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Approved and rejected routes must differ.', path: ['rejectedRouteId'] });
  if (!activeApprovalLanguage.test(`${approval.name} ${approval.description} ${approval.approvalCriteria ?? ''}`)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Approval must describe an active human approval boundary.', path: ['description'] });
});

export const workflowBriefMergeTypeSchema = z.enum(['all', 'any', 'first-completed']);
export const workflowBriefMergeSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: textSchema,
  mergeType: workflowBriefMergeTypeSchema,
  incomingRouteIds: z.array(idSchema).min(2),
  targetActionId: idSchema,
}).strict().superRefine((merge, context) => {
  if (new Set(merge.incomingRouteIds).size !== merge.incomingRouteIds.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Merge incoming routes must be unique.', path: ['incomingRouteIds'] });
});

export const workflowBriefIteratorSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: textSchema,
  sourceActionId: idSchema,
  itemDescription: textSchema,
  bodyActionIds: z.array(idSchema).min(1),
  aggregatorId: idSchema.optional(),
}).strict();

export const workflowBriefAggregationTypeSchema = z.enum(['collect', 'summarize', 'count', 'group', 'combine']);
export const workflowBriefAggregatorSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: textSchema,
  aggregationType: workflowBriefAggregationTypeSchema,
  sourceIteratorId: idSchema,
  targetActionId: idSchema,
  outputDescription: textSchema,
}).strict();

export const workflowBriefEntityTypeSchema = z.enum([
  'actor', 'application', 'trigger', 'action', 'route', 'decision', 'loop', 'wait',
  'approval', 'merge', 'iterator', 'aggregator', 'capability',
]);

export const workflowBriefEvidenceSourceTypeSchema = z.enum([
  'requirement-text', 'user-confirmation', 'user-edit', 'imported-data', 'system-inference',
]);
export const workflowBriefEvidenceSchema = z.object({
  id: idSchema,
  sourceType: workflowBriefEvidenceSourceTypeSchema,
  sourceText: textSchema,
  sourceStart: z.number().int().nonnegative().optional(),
  sourceEnd: z.number().int().nonnegative().optional(),
  explanation: textSchema,
  relatedEntityType: workflowBriefEntityTypeSchema,
  relatedEntityId: idSchema,
}).strict().superRefine((evidence, context) => {
  if ((evidence.sourceStart === undefined) !== (evidence.sourceEnd === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Evidence source offsets must appear together.', path: ['sourceStart'] });
  } else if (evidence.sourceStart !== undefined && evidence.sourceEnd! <= evidence.sourceStart) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Evidence sourceEnd must be greater than sourceStart.', path: ['sourceEnd'] });
  }
});

export const workflowBriefConfidenceLevelSchema = z.enum(['low', 'medium', 'high', 'confirmed']);
export const workflowBriefConfidenceSchema = z.object({
  id: idSchema,
  entityType: workflowBriefEntityTypeSchema,
  entityId: idSchema,
  score: z.number().min(0).max(1),
  level: workflowBriefConfidenceLevelSchema,
  reason: textSchema,
}).strict().superRefine((confidence, context) => {
  const matches = confidence.level === 'low' ? confidence.score < 0.5
    : confidence.level === 'medium' ? confidence.score >= 0.5 && confidence.score < 0.8
      : confidence.level === 'high' ? confidence.score >= 0.8 && confidence.score < 1
        : confidence.score === 1;
  if (!matches) context.addIssue({ code: z.ZodIssueCode.custom, message: `Confidence score does not match the ${confidence.level} level.`, path: ['score'] });
});

export const workflowBriefClarificationPrioritySchema = z.enum(['low', 'medium', 'high', 'blocking']);
export const workflowBriefClarificationStatusSchema = z.enum(['open', 'answered', 'dismissed']);
export const workflowBriefClarificationAnswerSourceSchema = z.enum(['user', 'imported-data', 'system']);
export const workflowBriefClarificationQuestionSchema = z.object({
  id: idSchema,
  question: textSchema,
  reason: textSchema,
  relatedEntityType: workflowBriefEntityTypeSchema.optional(),
  relatedEntityId: idSchema.optional(),
  priority: workflowBriefClarificationPrioritySchema,
  status: workflowBriefClarificationStatusSchema,
  answer: textSchema.optional(),
  answerSource: workflowBriefClarificationAnswerSourceSchema.optional(),
  createdFromEvidenceIds: z.array(idSchema),
}).strict().superRefine((question, context) => {
  if ((question.relatedEntityType === undefined) !== (question.relatedEntityId === undefined)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Clarification related entity type and ID must appear together.', path: ['relatedEntityId'] });
  if (new Set(question.createdFromEvidenceIds).size !== question.createdFromEvidenceIds.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Clarification evidence IDs must be unique.', path: ['createdFromEvidenceIds'] });
  if (question.status === 'answered' && (!question.answer || !question.answerSource)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Answered clarifications require an answer and answerSource.', path: ['answer'] });
  if (question.status !== 'answered' && (question.answer !== undefined || question.answerSource !== undefined)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Only answered clarifications may carry an answer.', path: ['answer'] });
});

export const workflowBriefReviewDecisionStateSchema = z.enum(['suggested', 'required', 'confirmed', 'rejected', 'edited']);
export const workflowBriefReviewedBySchema = z.enum(['system', 'user', 'imported']);
export const workflowBriefReviewDecisionSchema = z.object({
  id: idSchema,
  entityType: workflowBriefEntityTypeSchema,
  entityId: idSchema,
  state: workflowBriefReviewDecisionStateSchema,
  reason: textSchema,
  reviewedBy: workflowBriefReviewedBySchema,
  reviewedAt: z.string().datetime().optional(),
  replacementEntityId: idSchema.optional(),
}).strict().superRefine((decision, context) => {
  if (decision.replacementEntityId === decision.entityId) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A replacement entity must differ from the reviewed entity.', path: ['replacementEntityId'] });
  if (decision.reviewedBy === 'user' && ['confirmed', 'rejected'].includes(decision.state) && !decision.reviewedAt) context.addIssue({ code: z.ZodIssueCode.custom, message: 'User confirmations and rejections require reviewedAt.', path: ['reviewedAt'] });
});

export const workflowBriefCapabilityTypeSchema = z.enum([
  'binary-decision', 'multi-route-decision', 'loop', 'retry', 'wait', 'approval', 'merge',
  'iterator', 'aggregator', 'ai-agent', 'ai-classification', 'ai-extraction',
  'ai-summarization', 'ai-generation', 'human-review', 'error-handling', 'sub-workflow',
]);
const platformImplementationLanguage = /\b(?:n8n|make(?:\.com)?|zapier|switch node|router module|paths by zapier|loop over items|merge node)\b/i;
export const workflowBriefCapabilitySuggestionSchema = z.object({
  id: idSchema,
  capabilityType: workflowBriefCapabilityTypeSchema,
  name: nameSchema.refine((value) => !platformImplementationLanguage.test(value), 'Capability names must remain business-level.'),
  description: textSchema.refine((value) => !platformImplementationLanguage.test(value), 'Capability descriptions must remain business-level.'),
  relatedEntityIds: z.array(idSchema),
  evidenceIds: z.array(idSchema),
  confidenceId: idSchema,
  reviewDecisionId: idSchema,
  configurationQuestions: z.array(textSchema),
}).strict().superRefine((capability, context) => {
  if (new Set(capability.relatedEntityIds).size !== capability.relatedEntityIds.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Capability related entity IDs must be unique.', path: ['relatedEntityIds'] });
  if (new Set(capability.evidenceIds).size !== capability.evidenceIds.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Capability evidence IDs must be unique.', path: ['evidenceIds'] });
});

export const workflowBriefReviewStatusSchema = z.enum(['draft', 'under-review', 'needs-clarification', 'reviewed', 'locked', 'rejected']);
export const workflowBriefLockedBySchema = z.enum(['user', 'system', 'imported']);
export const workflowBriefReviewStateSchema = z.object({
  status: workflowBriefReviewStatusSchema,
  lockedAt: z.string().datetime().optional(),
  lockedBy: workflowBriefLockedBySchema.optional(),
  version: z.number().int().positive(),
  notes: z.array(textSchema),
}).strict().superRefine((state, context) => {
  if (state.status === 'locked' && (!state.lockedAt || !state.lockedBy)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A locked brief requires lockedAt and lockedBy.', path: ['lockedAt'] });
  if (state.status !== 'locked' && (state.lockedAt !== undefined || state.lockedBy !== undefined)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Only a locked brief may carry lock metadata.', path: ['lockedAt'] });
});

export const WORKFLOW_BRIEF_ENTITY_TYPES = Object.freeze([...workflowBriefEntityTypeSchema.options]);
export const WORKFLOW_BRIEF_CAPABILITY_TYPES = Object.freeze([...workflowBriefCapabilityTypeSchema.options]);
export const WORKFLOW_BRIEF_REVIEW_STATES = Object.freeze([...workflowBriefReviewStatusSchema.options]);
export const WORKFLOW_BRIEF_CONTROL_FLOW_ENUMS = Object.freeze({
  decisionTypes: Object.freeze([...workflowBriefDecisionTypeSchema.options]),
  loopTypes: Object.freeze([...workflowBriefLoopTypeSchema.options]),
  waitTypes: Object.freeze([...workflowBriefWaitTypeSchema.options]),
  mergeTypes: Object.freeze([...workflowBriefMergeTypeSchema.options]),
  aggregationTypes: Object.freeze([...workflowBriefAggregationTypeSchema.options]),
});

const uniqueIds = (
  items: readonly { id: string }[],
  collection: 'actors' | 'applications' | 'triggers' | 'actions' | 'routes' | 'decisions' | 'loops' | 'waits' | 'approvals' | 'merges' | 'iterators' | 'aggregators' | 'evidence' | 'confidence' | 'clarificationQuestions' | 'reviewDecisions' | 'capabilitySuggestions',
  context: z.RefinementCtx,
) => {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate ${collection} ID "${item.id}" is not allowed.`,
        path: [collection, index, 'id'],
      });
    }
    seen.add(item.id);
  });
};

export const canonicalWorkflowBriefSchema = z.object({
  schemaVersion: z.literal(CANONICAL_WORKFLOW_BRIEF_SCHEMA_VERSION),
  id: idSchema,
  name: nameSchema,
  summary: textSchema,
  objective: textSchema,
  sourceRequirement: textSchema,
  actors: z.array(workflowBriefActorSchema),
  applications: z.array(workflowBriefApplicationSchema),
  triggers: z.array(workflowBriefTriggerSchema).min(1, 'At least one trigger is required.'),
  actions: z.array(workflowBriefActionSchema).min(1, 'At least one action is required.'),
  routes: z.array(workflowBriefRouteSchema),
  decisions: z.array(workflowBriefDecisionSchema),
  loops: z.array(workflowBriefLoopSchema),
  waits: z.array(workflowBriefWaitSchema),
  approvals: z.array(workflowBriefApprovalSchema),
  merges: z.array(workflowBriefMergeSchema),
  iterators: z.array(workflowBriefIteratorSchema),
  aggregators: z.array(workflowBriefAggregatorSchema),
  evidence: z.array(workflowBriefEvidenceSchema),
  confidence: z.array(workflowBriefConfidenceSchema),
  clarificationQuestions: z.array(workflowBriefClarificationQuestionSchema),
  reviewDecisions: z.array(workflowBriefReviewDecisionSchema),
  capabilitySuggestions: z.array(workflowBriefCapabilitySuggestionSchema),
  reviewState: workflowBriefReviewStateSchema,
  assumptions: z.array(textSchema),
  missingInformation: z.array(textSchema),
  warnings: z.array(textSchema),
  completionCriteria: z.array(textSchema),
}).strict().superRefine((brief, context) => {
  uniqueIds(brief.actors, 'actors', context);
  uniqueIds(brief.applications, 'applications', context);
  uniqueIds(brief.triggers, 'triggers', context);
  uniqueIds(brief.actions, 'actions', context);
  uniqueIds(brief.routes, 'routes', context);
  uniqueIds(brief.decisions, 'decisions', context);
  uniqueIds(brief.loops, 'loops', context);
  uniqueIds(brief.waits, 'waits', context);
  uniqueIds(brief.approvals, 'approvals', context);
  uniqueIds(brief.merges, 'merges', context);
  uniqueIds(brief.iterators, 'iterators', context);
  uniqueIds(brief.aggregators, 'aggregators', context);
  uniqueIds(brief.evidence, 'evidence', context);
  uniqueIds(brief.confidence, 'confidence', context);
  uniqueIds(brief.clarificationQuestions, 'clarificationQuestions', context);
  uniqueIds(brief.reviewDecisions, 'reviewDecisions', context);
  uniqueIds(brief.capabilitySuggestions, 'capabilitySuggestions', context);

  const applicationIds = new Set(brief.applications.map((application) => application.id));
  brief.triggers.forEach((trigger, index) => {
    if (trigger.applicationId && !applicationIds.has(trigger.applicationId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unknown application reference "${trigger.applicationId}".`,
        path: ['triggers', index, 'applicationId'],
      });
    }
  });
  brief.actions.forEach((action, index) => {
    if (action.applicationId && !applicationIds.has(action.applicationId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unknown application reference "${action.applicationId}".`,
        path: ['actions', index, 'applicationId'],
      });
    }
  });

  const actorIds = new Set(brief.actors.map((actor) => actor.id));
  brief.actions.forEach((action, index) => {
    if (action.actorId && !actorIds.has(action.actorId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unknown actor reference "${action.actorId}".`,
        path: ['actions', index, 'actorId'],
      });
    }
  });

  const actionIds = new Set(brief.actions.map((action) => action.id));
  const routeIds = new Set(brief.routes.map((route) => route.id));
  const decisionIds = new Set(brief.decisions.map((decision) => decision.id));
  const iteratorIds = new Set(brief.iterators.map((iterator) => iterator.id));
  const aggregatorIds = new Set(brief.aggregators.map((aggregator) => aggregator.id));
  const requireReference = (exists: boolean, message: string, path: (string | number)[]) => {
    if (!exists) context.addIssue({ code: z.ZodIssueCode.custom, message, path });
  };

  brief.decisions.forEach((decision, index) => {
    decision.routeIds.forEach((routeId, routeIndex) => requireReference(routeIds.has(routeId), `Unknown route reference "${routeId}".`, ['decisions', index, 'routeIds', routeIndex]));
    const fallbacks = brief.routes.filter((route) => route.decisionId === decision.id && route.isFallback);
    if (fallbacks.length > 1) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A decision may have only one fallback route.', path: ['decisions', index, 'fallbackRouteId'] });
    if (decision.fallbackRouteId && fallbacks[0]?.id !== decision.fallbackRouteId) context.addIssue({ code: z.ZodIssueCode.custom, message: 'fallbackRouteId must identify the decision route marked as fallback.', path: ['decisions', index, 'fallbackRouteId'] });
    if (!decision.fallbackRouteId && fallbacks.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A route marked as fallback must be named by fallbackRouteId.', path: ['decisions', index, 'fallbackRouteId'] });
  });
  brief.routes.forEach((route, index) => {
    requireReference(decisionIds.has(route.decisionId), `Unknown decision reference "${route.decisionId}".`, ['routes', index, 'decisionId']);
    if (route.targetActionId) requireReference(actionIds.has(route.targetActionId), `Unknown action reference "${route.targetActionId}".`, ['routes', index, 'targetActionId']);
    const owners = brief.decisions.filter((decision) => decision.routeIds.includes(route.id));
    if (owners.length !== 1 || owners[0]?.id !== route.decisionId) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Each route must belong to exactly one matching decision.', path: ['routes', index, 'decisionId'] });
  });
  brief.loops.forEach((loop, index) => {
    requireReference(actionIds.has(loop.entryActionId), `Unknown action reference "${loop.entryActionId}".`, ['loops', index, 'entryActionId']);
    loop.bodyActionIds.forEach((id, actionIndex) => requireReference(actionIds.has(id), `Unknown action reference "${id}".`, ['loops', index, 'bodyActionIds', actionIndex]));
    if (loop.loopBackActionId) requireReference(actionIds.has(loop.loopBackActionId), `Unknown action reference "${loop.loopBackActionId}".`, ['loops', index, 'loopBackActionId']);
  });
  brief.waits.forEach((wait, index) => requireReference(actionIds.has(wait.resumeActionId), `Unknown action reference "${wait.resumeActionId}".`, ['waits', index, 'resumeActionId']));
  brief.approvals.forEach((approval, index) => {
    if (approval.approverActorId) requireReference(actorIds.has(approval.approverActorId), `Unknown actor reference "${approval.approverActorId}".`, ['approvals', index, 'approverActorId']);
    requireReference(actionIds.has(approval.requestActionId), `Unknown action reference "${approval.requestActionId}".`, ['approvals', index, 'requestActionId']);
    for (const [field, id] of [['approvedRouteId', approval.approvedRouteId], ['rejectedRouteId', approval.rejectedRouteId], ['timeoutRouteId', approval.timeoutRouteId]] as const) if (id) requireReference(routeIds.has(id), `Unknown route reference "${id}".`, ['approvals', index, field]);
  });
  brief.merges.forEach((merge, index) => {
    merge.incomingRouteIds.forEach((id, routeIndex) => requireReference(routeIds.has(id), `Unknown route reference "${id}".`, ['merges', index, 'incomingRouteIds', routeIndex]));
    requireReference(actionIds.has(merge.targetActionId), `Unknown action reference "${merge.targetActionId}".`, ['merges', index, 'targetActionId']);
  });
  brief.iterators.forEach((iterator, index) => {
    requireReference(actionIds.has(iterator.sourceActionId), `Unknown action reference "${iterator.sourceActionId}".`, ['iterators', index, 'sourceActionId']);
    iterator.bodyActionIds.forEach((id, actionIndex) => requireReference(actionIds.has(id), `Unknown action reference "${id}".`, ['iterators', index, 'bodyActionIds', actionIndex]));
    if (iterator.aggregatorId) {
      requireReference(aggregatorIds.has(iterator.aggregatorId), `Unknown aggregator reference "${iterator.aggregatorId}".`, ['iterators', index, 'aggregatorId']);
      const aggregator = brief.aggregators.find((item) => item.id === iterator.aggregatorId);
      if (aggregator && aggregator.sourceIteratorId !== iterator.id) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Iterator and aggregator references must agree.', path: ['iterators', index, 'aggregatorId'] });
    }
  });
  brief.aggregators.forEach((aggregator, index) => {
    requireReference(iteratorIds.has(aggregator.sourceIteratorId), `Unknown iterator reference "${aggregator.sourceIteratorId}".`, ['aggregators', index, 'sourceIteratorId']);
    requireReference(actionIds.has(aggregator.targetActionId), `Unknown action reference "${aggregator.targetActionId}".`, ['aggregators', index, 'targetActionId']);
    const iterator = brief.iterators.find((item) => item.id === aggregator.sourceIteratorId);
    if (iterator?.aggregatorId && iterator.aggregatorId !== aggregator.id) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Iterator and aggregator references must agree.', path: ['aggregators', index, 'sourceIteratorId'] });
  });

  const entityIds: Record<z.infer<typeof workflowBriefEntityTypeSchema>, Set<string>> = {
    actor: actorIds, application: applicationIds, trigger: new Set(brief.triggers.map((item) => item.id)), action: actionIds,
    route: routeIds, decision: decisionIds, loop: new Set(brief.loops.map((item) => item.id)), wait: new Set(brief.waits.map((item) => item.id)),
    approval: new Set(brief.approvals.map((item) => item.id)), merge: new Set(brief.merges.map((item) => item.id)), iterator: iteratorIds,
    aggregator: aggregatorIds, capability: new Set(brief.capabilitySuggestions.map((item) => item.id)),
  };
  const referenceExists = (type: z.infer<typeof workflowBriefEntityTypeSchema>, id: string) => entityIds[type].has(id);
  const evidenceIds = new Set(brief.evidence.map((item) => item.id));
  const confidenceById = new Map(brief.confidence.map((item) => [item.id, item]));
  const reviewDecisionById = new Map(brief.reviewDecisions.map((item) => [item.id, item]));

  brief.evidence.forEach((evidence, index) => {
    requireReference(referenceExists(evidence.relatedEntityType, evidence.relatedEntityId), `Unknown ${evidence.relatedEntityType} reference "${evidence.relatedEntityId}".`, ['evidence', index, 'relatedEntityId']);
    if (evidence.sourceType === 'requirement-text' && evidence.sourceEnd !== undefined && evidence.sourceEnd > brief.sourceRequirement.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Evidence source offsets exceed sourceRequirement length.', path: ['evidence', index, 'sourceEnd'] });
  });
  brief.confidence.forEach((confidence, index) => requireReference(referenceExists(confidence.entityType, confidence.entityId), `Unknown ${confidence.entityType} reference "${confidence.entityId}".`, ['confidence', index, 'entityId']));
  brief.clarificationQuestions.forEach((question, index) => {
    if (question.relatedEntityType && question.relatedEntityId) requireReference(referenceExists(question.relatedEntityType, question.relatedEntityId), `Unknown ${question.relatedEntityType} reference "${question.relatedEntityId}".`, ['clarificationQuestions', index, 'relatedEntityId']);
    question.createdFromEvidenceIds.forEach((id, evidenceIndex) => requireReference(evidenceIds.has(id), `Unknown evidence reference "${id}".`, ['clarificationQuestions', index, 'createdFromEvidenceIds', evidenceIndex]));
  });
  brief.reviewDecisions.forEach((decision, index) => {
    requireReference(referenceExists(decision.entityType, decision.entityId), `Unknown ${decision.entityType} reference "${decision.entityId}".`, ['reviewDecisions', index, 'entityId']);
    if (decision.replacementEntityId) requireReference(referenceExists(decision.entityType, decision.replacementEntityId), `Unknown replacement ${decision.entityType} reference "${decision.replacementEntityId}".`, ['reviewDecisions', index, 'replacementEntityId']);
  });
  brief.capabilitySuggestions.forEach((capability, index) => {
    capability.relatedEntityIds.forEach((id, relatedIndex) => {
      const matches = Object.values(entityIds).some((ids) => ids.has(id));
      requireReference(matches, `Unknown related entity reference "${id}".`, ['capabilitySuggestions', index, 'relatedEntityIds', relatedIndex]);
    });
    capability.evidenceIds.forEach((id, evidenceIndex) => requireReference(evidenceIds.has(id), `Unknown evidence reference "${id}".`, ['capabilitySuggestions', index, 'evidenceIds', evidenceIndex]));
    const confidence = confidenceById.get(capability.confidenceId);
    requireReference(Boolean(confidence), `Unknown confidence reference "${capability.confidenceId}".`, ['capabilitySuggestions', index, 'confidenceId']);
    if (confidence && (confidence.entityType !== 'capability' || confidence.entityId !== capability.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Capability confidence must describe the same capability.', path: ['capabilitySuggestions', index, 'confidenceId'] });
    const reviewDecision = reviewDecisionById.get(capability.reviewDecisionId);
    requireReference(Boolean(reviewDecision), `Unknown review decision reference "${capability.reviewDecisionId}".`, ['capabilitySuggestions', index, 'reviewDecisionId']);
    if (reviewDecision && (reviewDecision.entityType !== 'capability' || reviewDecision.entityId !== capability.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Capability review decision must describe the same capability.', path: ['capabilitySuggestions', index, 'reviewDecisionId'] });
  });

  if (brief.reviewState.status === 'locked') {
    if (brief.clarificationQuestions.some((question) => question.priority === 'blocking' && question.status === 'open')) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A locked brief cannot have an open blocking clarification.', path: ['clarificationQuestions'] });
    const controlFlowTypes = new Set(['route', 'decision', 'loop', 'wait', 'approval', 'merge', 'iterator', 'aggregator', 'capability']);
    if (brief.reviewDecisions.some((decision) => decision.state === 'rejected' && controlFlowTypes.has(decision.entityType))) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A locked brief cannot contain an active rejected capability or control-flow decision.', path: ['reviewDecisions'] });
    brief.capabilitySuggestions.forEach((capability, index) => {
      if (capability.evidenceIds.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A locked capability requires evidence.', path: ['capabilitySuggestions', index, 'evidenceIds'] });
      const decision = reviewDecisionById.get(capability.reviewDecisionId);
      if (!decision || !['confirmed', 'required'].includes(decision.state)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A locked capability requires a confirmed or required review decision.', path: ['capabilitySuggestions', index, 'reviewDecisionId'] });
    });
  }
});

export function parseCanonicalWorkflowBrief(input: unknown): CanonicalWorkflowBrief {
  return canonicalWorkflowBriefSchema.parse(input);
}

export function safeParseCanonicalWorkflowBrief(input: unknown) {
  return canonicalWorkflowBriefSchema.safeParse(input);
}

export function serializeCanonicalWorkflowBrief(input: unknown): string {
  return JSON.stringify(parseCanonicalWorkflowBrief(input));
}

export type WorkflowBriefActor = z.infer<typeof workflowBriefActorSchema>;
export type WorkflowBriefApplication = z.infer<typeof workflowBriefApplicationSchema>;
export type WorkflowBriefTriggerType = z.infer<typeof workflowBriefTriggerTypeSchema>;
export type WorkflowBriefTrigger = z.infer<typeof workflowBriefTriggerSchema>;
export type WorkflowBriefAction = z.infer<typeof workflowBriefActionSchema>;
export type WorkflowBriefDecisionType = z.infer<typeof workflowBriefDecisionTypeSchema>;
export type WorkflowBriefDecision = z.infer<typeof workflowBriefDecisionSchema>;
export type WorkflowBriefRoute = z.infer<typeof workflowBriefRouteSchema>;
export type WorkflowBriefLoopType = z.infer<typeof workflowBriefLoopTypeSchema>;
export type WorkflowBriefLoop = z.infer<typeof workflowBriefLoopSchema>;
export type WorkflowBriefWaitType = z.infer<typeof workflowBriefWaitTypeSchema>;
export type WorkflowBriefWait = z.infer<typeof workflowBriefWaitSchema>;
export type WorkflowBriefApproval = z.infer<typeof workflowBriefApprovalSchema>;
export type WorkflowBriefMergeType = z.infer<typeof workflowBriefMergeTypeSchema>;
export type WorkflowBriefMerge = z.infer<typeof workflowBriefMergeSchema>;
export type WorkflowBriefIterator = z.infer<typeof workflowBriefIteratorSchema>;
export type WorkflowBriefAggregationType = z.infer<typeof workflowBriefAggregationTypeSchema>;
export type WorkflowBriefAggregator = z.infer<typeof workflowBriefAggregatorSchema>;
export type WorkflowBriefEntityType = z.infer<typeof workflowBriefEntityTypeSchema>;
export type WorkflowBriefEvidenceSourceType = z.infer<typeof workflowBriefEvidenceSourceTypeSchema>;
export type WorkflowBriefEvidence = z.infer<typeof workflowBriefEvidenceSchema>;
export type WorkflowBriefConfidenceLevel = z.infer<typeof workflowBriefConfidenceLevelSchema>;
export type WorkflowBriefConfidence = z.infer<typeof workflowBriefConfidenceSchema>;
export type WorkflowBriefClarificationPriority = z.infer<typeof workflowBriefClarificationPrioritySchema>;
export type WorkflowBriefClarificationStatus = z.infer<typeof workflowBriefClarificationStatusSchema>;
export type WorkflowBriefClarificationAnswerSource = z.infer<typeof workflowBriefClarificationAnswerSourceSchema>;
export type WorkflowBriefClarificationQuestion = z.infer<typeof workflowBriefClarificationQuestionSchema>;
export type WorkflowBriefReviewDecisionState = z.infer<typeof workflowBriefReviewDecisionStateSchema>;
export type WorkflowBriefReviewedBy = z.infer<typeof workflowBriefReviewedBySchema>;
export type WorkflowBriefReviewDecision = z.infer<typeof workflowBriefReviewDecisionSchema>;
export type WorkflowBriefCapabilityType = z.infer<typeof workflowBriefCapabilityTypeSchema>;
export type WorkflowBriefCapabilitySuggestion = z.infer<typeof workflowBriefCapabilitySuggestionSchema>;
export type WorkflowBriefReviewStatus = z.infer<typeof workflowBriefReviewStatusSchema>;
export type WorkflowBriefLockedBy = z.infer<typeof workflowBriefLockedBySchema>;
export type WorkflowBriefReviewState = z.infer<typeof workflowBriefReviewStateSchema>;
export type CanonicalWorkflowBrief = z.infer<typeof canonicalWorkflowBriefSchema>;
