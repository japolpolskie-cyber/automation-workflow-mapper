import { z } from 'zod';
import { v22ConceptualGraphSchema } from './v2-conceptual-graph.js';

const sourceReferenceSchema = v22ConceptualGraphSchema.shape.nodes.element.shape.sourceReferences.element;
const critiquePlatformSchema = z.enum(['zapier', 'make', 'n8n']);

export const graphCritiqueIssueSchema = z.object({
  severity: z.enum(['error', 'warning', 'suggestion']),
  code: z.string().min(1),
  category: z.enum(['semantic-quality', 'structural-quality', 'traceability', 'platform-fidelity', 'fragmentation', 'metadata-preservation']),
  nodeIds: z.array(z.string().min(1)),
  edgeIds: z.array(z.string().min(1)),
  sourceReferences: z.array(sourceReferenceSchema),
  explanation: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1),
  suggestedRepairKind: z.enum([
    'none', 'rename', 'merge-nodes', 'split-node', 'replace-decision', 'add-synchronization',
    'add-resume', 'add-correlation', 'add-collection-source', 'add-item-input',
    'bound-loop', 'add-exhausted-path', 'clarify-outcome', 'restore-traceability',
    'add-warning', 'resolve-operation', 'preserve-role', 'preserve-branch-label', 'preserve-metadata',
  ]),
  repairSafety: z.enum(['safe', 'review-required', 'unsafe']),
  confidence: z.number().min(0).max(1),
}).strict();

export const graphCritiqueMetricsSchema = z.object({
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  capabilityCount: z.number().int().nonnegative(),
  genericLabelCount: z.number().int().nonnegative(),
  binaryDecisionCount: z.number().int().nonnegative(),
  multiOutcomeCount: z.number().int().nonnegative(),
  parallelRouteCount: z.number().int().nonnegative(),
  synchronizationCount: z.number().int().nonnegative(),
  waitCount: z.number().int().nonnegative(),
  loopCount: z.number().int().nonnegative(),
  iteratorCount: z.number().int().nonnegative(),
  aggregatorCount: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  unresolvedOperationCount: z.number().int().nonnegative(),
  traceabilityCoverage: z.number().min(0).max(1),
  conceptualRolePreservationRate: z.number().min(0).max(1),
  platformCapabilitySafetyRate: z.number().min(0).max(1),
}).strict();

export const graphCritiqueSchema = z.object({
  version: z.literal('2.4A'),
  shadowMode: z.literal(true),
  graphKind: z.enum(['conceptual', 'platform']),
  platform: critiquePlatformSchema.nullable(),
  valid: z.boolean(),
  maximumSeverity: z.enum(['none', 'suggestion', 'warning', 'error']),
  issues: z.array(graphCritiqueIssueSchema),
  metrics: graphCritiqueMetricsSchema,
  aggregate: z.object({
    errorCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    suggestionCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export const graphCritiqueBundleSchema = z.object({
  conceptual: graphCritiqueSchema,
  platform: graphCritiqueSchema.optional(),
}).strict();

export type GraphCritiqueIssue = z.infer<typeof graphCritiqueIssueSchema>;
export type GraphCritiqueMetrics = z.infer<typeof graphCritiqueMetricsSchema>;
export type GraphCritique = z.infer<typeof graphCritiqueSchema>;
export type GraphCritiqueBundle = z.infer<typeof graphCritiqueBundleSchema>;
