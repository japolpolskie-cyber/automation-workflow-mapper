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

const uniqueIds = (
  items: readonly { id: string }[],
  collection: 'actors' | 'applications' | 'triggers' | 'actions',
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
  assumptions: z.array(textSchema),
  missingInformation: z.array(textSchema),
  warnings: z.array(textSchema),
  completionCriteria: z.array(textSchema),
}).strict().superRefine((brief, context) => {
  uniqueIds(brief.actors, 'actors', context);
  uniqueIds(brief.applications, 'applications', context);
  uniqueIds(brief.triggers, 'triggers', context);
  uniqueIds(brief.actions, 'actions', context);

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
export type CanonicalWorkflowBrief = z.infer<typeof canonicalWorkflowBriefSchema>;

