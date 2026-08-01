import { z } from 'zod';

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

const uniqueIds = (
  items: readonly { id: string }[],
  collection: 'actors' | 'applications' | 'triggers' | 'actions' | 'routes' | 'decisions' | 'loops' | 'waits' | 'approvals' | 'merges' | 'iterators' | 'aggregators',
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
  schemaVersion: z.literal('1.0'),
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
});

export function parseCanonicalWorkflowBrief(input: unknown): CanonicalWorkflowBrief {
  return canonicalWorkflowBriefSchema.parse(input);
}

export function safeParseCanonicalWorkflowBrief(input: unknown) {
  return canonicalWorkflowBriefSchema.safeParse(input);
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
export type CanonicalWorkflowBrief = z.infer<typeof canonicalWorkflowBriefSchema>;
