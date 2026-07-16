import { z } from 'zod';

export const evidenceTypeSchema = z.enum(['explicit', 'linguistic', 'semantic', 'pattern', 'derived', 'missing_information']);
export const evidenceRelationshipSchema = z.enum(['supporting', 'conflicting', 'missing']);

export const deterministicEvidenceSchema = z.object({
  id: z.string().min(1),
  evidenceType: evidenceTypeSchema,
  relationship: evidenceRelationshipSchema,
  confidence: z.number().min(0).max(1),
  weight: z.number().positive().max(10),
  ruleId: z.string().min(1),
  ruleVersion: z.string().min(1),
  ruleCategory: z.string().min(1),
  sourceLocation: z.object({ source: z.literal('scope'), start: z.number().int().nonnegative().nullable(), end: z.number().int().nonnegative().nullable(), segmentId: z.string().min(1).optional(), stepId: z.string().min(1).optional() }).strict(),
  evidenceText: z.string().min(1),
  explanation: z.string().min(1),
  relatedEvidenceIds: z.array(z.string().min(1)).default([]),
  supportingFactIds: z.array(z.string().min(1)).default([]),
}).strict();

export const confidenceCalculationSchema = z.object({
  scoringRuleId: z.literal('weighted-evidence-v1'),
  scoringRuleVersion: z.enum(['1.0.0', '1.1.0']),
  precedence: z.array(z.string().min(1)),
  contributingEvidenceIds: z.array(z.string().min(1)),
  weightedSupport: z.number().nonnegative(),
  weightedConflict: z.number().nonnegative(),
  totalWeight: z.number().positive(),
  completenessPenalty: z.number().min(0).max(1),
  formula: z.string().min(1),
  finalConfidence: z.number().min(0).max(1),
}).strict();

export const detectedProcessFactSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['application', 'entity', 'business_verb', 'decision', 'route', 'repetition', 'cardinality', 'pattern', 'workflow_function', 'uncertainty']),
  value: z.string().min(1),
  explanation: z.string().min(1),
  evidence: z.array(deterministicEvidenceSchema).min(1),
  confidence: confidenceCalculationSchema,
  subject: z.object({ entityId: z.string().min(1).nullable(), segmentId: z.string().min(1).nullable(), stepId: z.string().min(1).nullable() }).strict().optional(),
}).strict();

export const scopeSegmentSchema = z.object({ id: z.string().min(1), stepId: z.string().min(1), kind: z.enum(['step', 'clause']), index: z.number().int().nonnegative(), text: z.string().min(1), start: z.number().int().nonnegative(), end: z.number().int().positive() }).strict();
export const coverageResultSchema = z.object({ requiredDimensions: z.array(z.string()), detectedDimensions: z.array(z.string()), missingDimensions: z.array(z.string()), score: z.number().min(0).max(1), formula: z.string().min(1) }).strict();
export const workflowReliabilitySchema = z.object({ confidence: z.number().min(0).max(1), coverage: z.number().min(0).max(1), overall: z.number().min(0).max(1), formula: z.literal('confidence * coverage') }).strict();

export const processClarificationSchema = z.object({
  id: z.string().min(1),
  category: z.enum(['timing', 'repetition', 'escalation', 'channel', 'approval', 'condition', 'cardinality', 'duplicates']),
  question: z.string().min(1),
  reason: z.string().min(1),
  missingFact: z.string().min(1),
  assumptionNotMade: z.string().min(1),
  evidence: z.array(deterministicEvidenceSchema).min(1),
  confidence: confidenceCalculationSchema,
}).strict();

export const detectedProcessSummarySchema = z.object({
  version: z.literal('1.0'),
  feature: z.literal('k3-deterministic-scope-intelligence'),
  shadowMode: z.literal(true),
  segments: z.array(scopeSegmentSchema).optional(),
  facts: z.array(detectedProcessFactSchema),
  clarifications: z.array(processClarificationSchema),
  knowledgeContext: z.object({
    catalogVersion: z.string().min(1),
    retrieved: z.array(z.object({ kind: z.enum(['canonical_function', 'application', 'operation', 'pattern', 'manual']), id: z.string().min(1), reason: z.string().min(1), estimatedCharacters: z.number().int().nonnegative() }).strict()),
    estimatedCharacters: z.number().int().nonnegative(),
    maximumCharacters: z.number().int().positive(),
    truncated: z.boolean(),
  }).strict(),
  coverage: coverageResultSchema.optional(),
  reliability: workflowReliabilitySchema.optional(),
  generatedAt: z.string().datetime(),
}).strict();

export type EvidenceType = z.infer<typeof evidenceTypeSchema>;
export type DeterministicEvidence = z.infer<typeof deterministicEvidenceSchema>;
export type ConfidenceCalculation = z.infer<typeof confidenceCalculationSchema>;
export type DetectedProcessFact = z.infer<typeof detectedProcessFactSchema>;
export type ProcessClarification = z.infer<typeof processClarificationSchema>;
export type DetectedProcessSummary = z.infer<typeof detectedProcessSummarySchema>;
export type ScopeSegment = z.infer<typeof scopeSegmentSchema>;
export type CoverageResult = z.infer<typeof coverageResultSchema>;
export type WorkflowReliability = z.infer<typeof workflowReliabilitySchema>;
