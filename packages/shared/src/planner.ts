import { z } from 'zod';
const plannerPlatformSchema = z.enum(['zapier', 'make', 'n8n']);

export const plannerEvidenceSchema = z.object({ id: z.string().min(1), evidenceType: z.enum(['explicit', 'linguistic', 'semantic', 'pattern', 'derived', 'missing_information']), ruleId: z.string().min(1), ruleVersion: z.string().min(1), text: z.string().min(1), explanation: z.string().min(1), sourceStart: z.number().int().nonnegative().nullable(), sourceEnd: z.number().int().nonnegative().nullable() }).strict();
export const plannerFactSchema = z.object({ id: z.string().min(1), kind: z.enum(['application', 'entity', 'business_verb', 'decision', 'route', 'repetition', 'cardinality', 'workflow_function']), value: z.string().min(1), explanation: z.string().min(1), entityId: z.string().nullable(), evidenceIds: z.array(z.string().min(1)) }).strict();
export const plannerClarificationSchema = z.object({ id: z.string().min(1), category: z.string().min(1), question: z.string().min(1), reason: z.string().min(1), missingFact: z.string().min(1), evidenceIds: z.array(z.string().min(1)) }).strict();
export const plannerKnowledgeEntrySchema = z.object({ kind: z.enum(['application', 'manual', 'operation', 'pattern', 'capability']), id: z.string().min(1), title: z.string().min(1), purpose: z.string().min(1), canonicalFunctionId: z.string().nullable(), applicationId: z.string().nullable(), operationId: z.string().nullable(), support: z.enum(['native', 'workaround', 'unsupported', 'unknown']).nullable(), requiredInputs: z.array(z.string()), outputs: z.array(z.string()), limitations: z.array(z.string()), alternatives: z.array(z.string()) }).strict();
export const plannerContextSchema = z.object({ version: z.literal('1.0'), objective: z.string().min(1), platform: plannerPlatformSchema, facts: z.array(plannerFactSchema), evidence: z.array(plannerEvidenceSchema), clarifications: z.array(plannerClarificationSchema), patterns: z.array(plannerKnowledgeEntrySchema), knowledge: z.array(plannerKnowledgeEntrySchema), capabilities: z.array(plannerKnowledgeEntrySchema), allowedApplications: z.array(z.string().min(1)), allowedCanonicalFunctions: z.array(z.string().min(1)), supportedOperations: z.array(z.string()), constraints: z.array(z.string().min(1)) }).strict();

export const plannerNodeSchema = z.object({
  id: z.string().min(1),
  canonicalFunctionId: z.string().min(1),
  title: z.string().min(1),
  applicationRef: z.string().nullable(),
  operationRef: z.string().nullable(),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  factIds: z.array(z.string().min(1)),
  patternIds: z.array(z.string().min(1)),
  knowledgeIds: z.array(z.string().min(1)),
  capabilityIds: z.array(z.string().min(1)),
  blockedByClarificationIds: z.array(z.string().min(1)),
  limitationAcknowledgements: z.array(z.string()),
}).strict();

export const plannerEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  condition: z.string().nullable(),
  label: z.string().min(1),
  purpose: z.string().min(1),
  businessReason: z.string().min(1),
  ruleId: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
}).strict();

export const structuredWorkflowPlanSchema = z.object({
  version: z.literal('1.1'),
  objective: z.string().min(1),
  platform: plannerPlatformSchema,
  entryNodeId: z.string().min(1),
  nodes: z.array(plannerNodeSchema).min(1),
  edges: z.array(plannerEdgeSchema),
  binaryConditions: z.array(z.object({ nodeId: z.string().min(1), trueEdgeId: z.string().min(1), falseEdgeId: z.string().min(1) }).strict()),
  routers: z.array(z.object({ nodeId: z.string().min(1), routes: z.array(z.object({ label: z.string().min(1), condition: z.string().min(1), destination: z.string().min(1), edgeId: z.string().min(1) }).strict()).min(2) }).strict()),
  merges: z.array(z.object({ nodeId: z.string().min(1), incomingBranches: z.array(z.string().min(1)).min(2), mergeStrategy: z.enum(['wait_all', 'first_available', 'combine', 'concatenate']), continuationEdgeId: z.string().min(1) }).strict()),
  loops: z.array(z.object({ nodeId: z.string().min(1), entryEdgeId: z.string().min(1), bodyEntryNodeId: z.string().min(1), bodyExitNodeId: z.string().min(1), exitEdgeId: z.string().min(1), terminationCondition: z.string().min(1) }).strict()),
  retries: z.array(z.object({ nodeId: z.string().min(1), targetNodeId: z.string().min(1), maximumAttempts: z.number().int().positive().nullable(), delay: z.string().nullable(), terminationCondition: z.string().min(1), failureEdgeId: z.string().min(1) }).strict()),
  blockedByClarificationIds: z.array(z.string().min(1)),
  warnings: z.array(z.string()),
}).strict();

export const plannerFailureCategorySchema = z.enum([
  'connection_failure',
  'ollama_unavailable',
  'timeout',
  'context_too_large',
  'output_too_large',
  'invalid_json',
  'schema_mismatch',
  'unsupported_reference',
  'incomplete_graph',
  'validation_failure',
  'cancellation',
  'unknown_provider_error',
]);

export const plannerShadowComparisonSchema = z.object({
  status: z.enum(['completed', 'failed']),
  groundedPlan: structuredWorkflowPlanSchema.nullable(),
  differences: z.object({ improvedDetections: z.array(z.string()), lostDetections: z.array(z.string()), unsupportedOperations: z.array(z.string()), preservedClarifications: z.array(z.string()) }).strict(),
  metrics: z.object({
    oldNodeCount: z.number().int().nonnegative(),
    groundedStepCount: z.number().int().nonnegative(),
    groundedEdgeCount: z.number().int().nonnegative().default(0),
    promptCharacters: z.number().int().nonnegative(),
    retrievedKnowledgeCharacters: z.number().int().nonnegative(),
    planningLatencyMs: z.number().nonnegative(),
    rawScopeCharacters: z.number().int().nonnegative().default(0),
    estimatedPromptTokens: z.number().int().nonnegative().default(0),
    generatedOutputCharacters: z.number().int().nonnegative().default(0),
    timeToFirstByteMs: z.number().nonnegative().nullable().default(null),
    parseLatencyMs: z.number().nonnegative().default(0),
    validationLatencyMs: z.number().nonnegative().default(0),
    retryCount: z.number().int().nonnegative().default(0),
    promptSectionCharacters: z.record(z.number().int().nonnegative()).default({}),
  }).strict(),
  diagnostic: z.object({
    failureCategory: plannerFailureCategorySchema.nullable(),
    stage: z.enum(['context', 'generation', 'parse', 'schema', 'reference', 'validation', 'completed']),
    cacheHit: z.boolean(),
    compacted: z.boolean(),
    cancelled: z.boolean(),
  }).strict().optional(),
  error: z.string().nullable(),
}).strict();

export type PlannerContext = z.infer<typeof plannerContextSchema>;
export type StructuredWorkflowPlan = z.infer<typeof structuredWorkflowPlanSchema>;
export type PlannerShadowComparison = z.infer<typeof plannerShadowComparisonSchema>;
export type PlannerFailureCategory = z.infer<typeof plannerFailureCategorySchema>;
