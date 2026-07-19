import { z } from 'zod';
import { graphCritiqueIssueSchema, graphCritiqueSchema } from './v2-graph-critique.js';
import { platformTranslationResultSchema } from './v2-platform-translation.js';
import { v22ConceptualGraphSchema } from './v2-conceptual-graph.js';

const sourceReferenceSchema = v22ConceptualGraphSchema.shape.nodes.element.shape.sourceReferences.element;
const repairPlatformSchema = z.enum(['zapier', 'make', 'n8n']);

export const graphRepairActionSchema = z.object({
  sourceIssueCode: z.string().min(1),
  repairKind: z.enum(['restore-traceability', 'restore-branch-label', 'restore-control-metadata', 'add-warning', 'canonical-normalization']),
  repairSafety: z.enum(['safe', 'review-required', 'unsafe']),
  nodeIds: z.array(z.string().min(1)),
  edgeIds: z.array(z.string().min(1)),
  beforeSummary: z.string().min(1),
  afterSummary: z.string().min(1),
  fieldsChanged: z.array(z.string().min(1)),
  sourceReferences: z.array(sourceReferenceSchema),
  evidence: z.array(z.string().min(1)).min(1),
  confidence: z.number().min(0).max(1),
  status: z.enum(['applied', 'skipped']),
  skipReason: z.string().min(1).nullable(),
  validation: z.object({
    valid: z.boolean(),
    issues: z.array(z.string().min(1)),
  }).strict(),
}).strict();

export const graphRepairReportSchema = z.object({
  version: z.literal('2.4B'),
  shadowMode: z.literal(true),
  graphKind: z.enum(['conceptual', 'platform']),
  platform: repairPlatformSchema.nullable(),
  actions: z.array(graphRepairActionSchema),
  validation: z.object({
    valid: z.boolean(),
    issues: z.array(z.string().min(1)),
  }).strict(),
  remainingReviewRequiredIssues: z.array(graphCritiqueIssueSchema),
  beforeCritique: graphCritiqueSchema,
  afterCritique: graphCritiqueSchema,
}).strict();

export const graphRepairBundleSchema = z.object({
  conceptual: z.object({
    graph: v22ConceptualGraphSchema,
    report: graphRepairReportSchema,
  }).strict(),
  platform: z.object({
    graph: platformTranslationResultSchema,
    report: graphRepairReportSchema,
  }).strict().optional(),
}).strict();

export type GraphRepairAction = z.infer<typeof graphRepairActionSchema>;
export type GraphRepairReport = z.infer<typeof graphRepairReportSchema>;
export type GraphRepairBundle = z.infer<typeof graphRepairBundleSchema>;
