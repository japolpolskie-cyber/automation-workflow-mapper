import { z } from 'zod';

export const plannerSemanticRoles = [
  'workflow-trigger', 'data-retrieval', 'data-transformation', 'validation-gate',
  'binary-decision', 'multi-route-decision', 'collection-iterator', 'business-loop',
  'technical-retry', 'branch-merge', 'item-aggregator', 'delay-boundary',
  'notification', 'logging', 'manual-review', 'successful-end', 'blocked-end',
  'escalation-end', 'parallel-split', 'conditional-parallel-routing',
  'merge-all', 'merge-any', 'human-review', 'approval', 'event-wait',
  'resume-point', 'loop-until', 'error-handler', 'sub-workflow',
  'meaningful-end',
] as const;

export const plannerSemanticRoleSchema = z.enum(plannerSemanticRoles);
export type PlannerSemanticRole = z.infer<typeof plannerSemanticRoleSchema>;

export const plannerDataShapes = ['none', 'single', 'collection', 'branches', 'item-results', 'unknown'] as const;
export const plannerDataShapeSchema = z.enum(plannerDataShapes);
export type PlannerDataShape = z.infer<typeof plannerDataShapeSchema>;

export const plannerEdgeRoles = [
  'flow', 'true', 'false', 'route', 'fallback', 'loop-entry', 'loop-back',
  'loop-exit', 'retry', 'retry-exhausted', 'merge-input', 'continuation',
  'parallel-branch', 'conditional-branch', 'approved', 'rejected', 'resume',
  'timeout', 'item', 'item-result', 'iteration-complete', 'error',
  'handled', 'subworkflow-return',
] as const;
export const plannerEdgeRoleSchema = z.enum(plannerEdgeRoles);
export type PlannerEdgeRole = z.infer<typeof plannerEdgeRoleSchema>;

export const semanticRoleSlotSchema = z.object({
  slotId: z.string().min(1),
  role: plannerSemanticRoleSchema,
  allowedCanonicalFunctionSymbols: z.array(z.number().int().positive()).min(1),
  inputShape: plannerDataShapeSchema,
  outputShape: plannerDataShapeSchema,
  factSymbols: z.array(z.number().int().positive()),
  clarificationSymbols: z.array(z.number().int().positive()),
  patternSymbols: z.array(z.number().int().positive()),
  reason: z.string().min(1),
}).strict();

export type SemanticRoleSlot = z.infer<typeof semanticRoleSlotSchema>;
