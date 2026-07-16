import { z } from 'zod';
import { canonicalWorkflowSchema } from './domain.js';

export const evidenceReferenceSchema = z.object({
  id: z.string().uuid(),
  source: z.enum(['scope', 'document', 'rule', 'user_answer']),
  quote: z.string().min(1).max(2_000),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
}).strict().refine((value) => value.start === undefined || value.end === undefined || value.end >= value.start, { message: 'Evidence end must not precede its start.' });

export const dataCardinalitySchema = z.enum(['single', 'collection', 'unknown']);

export const detectedApplicationSchema = z.object({
  applicationId: z.string().min(1),
  name: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string().uuid()).default([]),
}).strict();

export const detectedEntitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  entityType: z.string().min(1),
  cardinality: dataCardinalitySchema,
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string().uuid()).default([]),
}).strict();

export const detectedDecisionSchema = z.object({
  id: z.string().min(1),
  decisionType: z.enum(['filter', 'binary', 'multi_route', 'approval']),
  question: z.string().min(1),
  outcomes: z.array(z.string().min(1)).min(2),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string().uuid()).default([]),
}).strict();

export const businessRuleFactSchema = z.object({
  id: z.string().min(1),
  ruleType: z.enum(['trigger', 'condition', 'timing', 'repetition', 'error', 'approval', 'data', 'security']),
  statement: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string().uuid()).default([]),
}).strict();

export const clarificationRequirementSchema = z.object({
  id: z.string().uuid(),
  question: z.string().min(1).max(1_000),
  reason: z.string().min(1).max(2_000),
  category: z.enum(['trigger', 'system', 'condition', 'timing', 'approval', 'error_handling', 'logging', 'data', 'security', 'other']),
  importance: z.enum(['required', 'recommended']),
  status: z.enum(['open', 'answered', 'dismissed']).default('open'),
  answer: z.string().max(5_000).nullable().default(null),
  evidenceIds: z.array(z.string().uuid()).default([]),
}).strict();

export const planningFactsSchema = z.object({
  version: z.literal('1.0'),
  objective: z.string().min(1).nullable().default(null),
  applications: z.array(detectedApplicationSchema).default([]),
  entities: z.array(detectedEntitySchema).default([]),
  decisions: z.array(detectedDecisionSchema).default([]),
  businessRules: z.array(businessRuleFactSchema).default([]),
  clarifications: z.array(clarificationRequirementSchema).default([]),
  evidence: z.array(evidenceReferenceSchema).default([]),
  assumptions: z.array(z.string().min(1)).default([]),
  createdAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  const evidenceIds = new Set(value.evidence.map((item) => item.id));
  const references = [...value.applications, ...value.entities, ...value.decisions, ...value.businessRules, ...value.clarifications].flatMap((item) => item.evidenceIds);
  for (const evidenceId of references) if (!evidenceIds.has(evidenceId)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown evidence reference ${evidenceId}.`, path: ['evidence'] });
});

export const workflowSetPreviewSchema = z.object({
  version: z.literal('1.0'),
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  workflows: z.array(canonicalWorkflowSchema).min(1),
}).strict();

export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;
export type DataCardinality = z.infer<typeof dataCardinalitySchema>;
export type DetectedApplication = z.infer<typeof detectedApplicationSchema>;
export type DetectedEntity = z.infer<typeof detectedEntitySchema>;
export type DetectedDecision = z.infer<typeof detectedDecisionSchema>;
export type BusinessRuleFact = z.infer<typeof businessRuleFactSchema>;
export type ClarificationRequirement = z.infer<typeof clarificationRequirementSchema>;
export type PlanningFacts = z.infer<typeof planningFactsSchema>;
export type WorkflowSetPreview = z.infer<typeof workflowSetPreviewSchema>;
