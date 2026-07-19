import { z } from 'zod';
import { detectedProcessSummarySchema } from './detected-process.js';
import { v21AnalysisArtifactsSchema } from './v2-analysis-contracts.js';
import { v22ConceptualGraphResultSchema } from './v2-conceptual-graph.js';
import { plannerShadowComparisonSchema } from './planner.js';

export const platformSchema = z.enum(['zapier', 'make', 'n8n']);
export const projectStatusSchema = z.enum(['draft', 'analyzing', 'ready', 'needs_input', 'archived']);
export const nodeCategorySchema = z.enum([
  'start', 'trigger', 'webhook', 'action', 'ai', 'condition', 'router', 'filter',
  'transformation', 'delay', 'loop', 'api_request', 'database', 'crm', 'spreadsheet',
  'email', 'messaging', 'notification', 'human_approval', 'error_handler', 'retry',
  'logger', 'merge', 'split', 'sub_workflow', 'end', 'note', 'group'
]);

export const branchLabelSchema = z.enum([
  'TRUE', 'FALSE', 'SUCCESS', 'FAILED', 'FOUND', 'NOT FOUND', 'APPROVED', 'REJECTED',
  'PAID', 'UNPAID', 'QUALIFIED', 'NOT QUALIFIED', 'DEFAULT', 'LOOP', 'DONE'
]);

export const fieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  dataType: z.enum(['string', 'number', 'boolean', 'date', 'object', 'array', 'unknown']),
  required: z.boolean().default(false),
  description: z.string().optional(),
  sampleValue: z.unknown().optional()
});

export const transformationTypeSchema = z.enum([
  'none', 'rename', 'concatenate', 'split', 'format_date', 'convert_number',
  'parse_json', 'extract_regex', 'map_enum', 'default_value', 'custom'
]);

export const dataMappingSchema = z.object({
  id: z.string().uuid().optional(),
  sourceField: z.string().min(1),
  destinationField: z.string().min(1),
  transformation: z.string().max(1_000).nullable().default(null),
  transformationType: transformationTypeSchema.default('none'),
  expression: z.string().max(2_000).nullable().default(null),
  required: z.boolean().default(false),
  sampleValue: z.unknown().optional()
});

export const conditionGroupSchema = z.object({
  combinator: z.enum(['and', 'or']).default('and'),
  rules: z.array(z.object({
    field: z.string().min(1),
    operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'exists', 'not_exists', 'matches', 'in']),
    value: z.unknown().optional()
  })).min(1)
});

export const workflowNodeSchema = z.object({
  id: z.string().uuid(),
  category: nodeCategorySchema,
  name: z.string().min(1).max(160),
  description: z.string().max(2_000).default(''),
  service: z.string().max(100).nullable().default(null),
  operation: z.string().max(160).nullable().default(null),
  purpose: z.string().max(2_000).default(''),
  expectedResult: z.string().max(2_000).default(''),
  icon: z.string().max(120).default('generic-action'),
  estimatedExecution: z.string().max(120).default('Under 1 minute'),
  inputs: z.array(fieldSchema).default([]),
  outputs: z.array(fieldSchema).default([]),
  credentials: z.array(z.string().min(1)).default([]),
  configuration: z.record(z.unknown()).default({}),
  status: z.enum(['unconfigured', 'incomplete', 'configured', 'warning']).default('unconfigured'),
  configurationCompleteness: z.number().int().min(0).max(100).default(0),
  conditions: z.array(conditionGroupSchema).default([]),
  decisionRule: z.object({
    decisionQuestion: z.string().max(1_000),
    field: z.string().max(500),
    operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'exists', 'not_exists', 'matches', 'in']),
    comparisonValue: z.unknown().optional(),
    trueLabel: branchLabelSchema.default('TRUE'),
    falseLabel: branchLabelSchema.default('FALSE')
  }).nullable().default(null),
  retryPolicy: z.object({ attempts: z.number().int().min(0).max(10), backoff: z.enum(['none', 'fixed', 'exponential']) }).optional(),
  timeoutSeconds: z.number().int().positive().max(86_400).optional(),
  notes: z.string().max(5_000).default(''),
  bestPractices: z.array(z.string().max(1_000)).default([]),
  potentialErrors: z.array(z.string().max(1_000)).default([]),
  alternativeImplementations: z.array(z.string().max(1_000)).default([]),
  performanceNotes: z.array(z.string().max(1_000)).default([]),
  securityNotes: z.array(z.string().max(1_000)).default([]),
  riskLevel: z.enum(['low', 'medium', 'high']).default('low')
});

export const workflowConnectionSchema = z.object({
  id: z.string().uuid(),
  sourceNodeId: z.string().uuid(),
  targetNodeId: z.string().uuid(),
  sourcePort: z.string().default('output'),
  targetPort: z.string().default('input'),
  label: z.string().max(120).default(''),
  condition: z.string().max(1_000).nullable().default(null),
  routeType: z.enum(['success', 'failure', 'conditional', 'default', 'error']).default('success'),
  branchLabel: branchLabelSchema.nullable().default(null),
  style: z.enum(['default', 'success', 'failure', 'conditional', 'loop']).default('default'),
  mappings: z.array(dataMappingSchema).default([])
});

export const workflowBranchSchema = z.object({
  id: z.string().uuid(),
  sourceNodeId: z.string().uuid(),
  name: z.string().min(1).max(160),
  condition: conditionGroupSchema.nullable().default(null),
  destinationNodeId: z.string().uuid().nullable().default(null),
  isDefault: z.boolean().default(false)
});

export const errorHandlingRuleSchema = z.object({
  id: z.string().uuid(),
  nodeId: z.string().uuid(),
  strategy: z.enum(['stop', 'continue', 'retry', 'fallback', 'notify', 'manual_review']),
  retryAttempts: z.number().int().min(0).max(10).default(0),
  fallbackNodeId: z.string().uuid().nullable().default(null),
  notificationNodeId: z.string().uuid().nullable().default(null),
  notes: z.string().max(2_000).default('')
});

export const clarificationQuestionSchema = z.object({
  id: z.string().uuid(),
  question: z.string().min(1).max(1_000),
  category: z.enum(['trigger', 'system', 'condition', 'timing', 'approval', 'error_handling', 'logging', 'data', 'security', 'other']),
  required: z.boolean().default(true),
  answer: z.string().max(5_000).nullable().default(null),
  relatedNodeId: z.string().uuid().nullable().default(null)
});

export const workflowRiskSchema = z.object({
  id: z.string().uuid(),
  category: z.enum(['pii', 'security', 'rate_limit', 'data_loss', 'cost', 'availability', 'compliance', 'maintainability']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().min(1).max(2_000),
  mitigation: z.string().max(2_000).default(''),
  nodeId: z.string().uuid().nullable().default(null)
});

export const canonicalWorkflowSchema = z.object({
  schemaVersion: z.enum(['1.0', '2.0']),
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  summary: z.string().max(5_000).default(''),
  objective: z.string().max(2_000).default(''),
  targetPlatform: platformSchema,
  confidence: z.number().min(0).max(1).nullable().default(null),
  actors: z.array(z.object({ name: z.string(), type: z.enum(['human', 'system', 'organization']) })).default([]),
  systems: z.array(z.object({ name: z.string(), category: z.string() })).default([]),
  nodes: z.array(workflowNodeSchema).default([]),
  connections: z.array(workflowConnectionSchema).default([]),
  branches: z.array(workflowBranchSchema).default([]),
  errorHandling: z.array(errorHandlingRuleSchema).default([]),
  clarificationQuestions: z.array(clarificationQuestionSchema).default([]),
  risks: z.array(workflowRiskSchema).default([]),
  complexity: z.enum(['simple', 'moderate', 'advanced', 'enterprise']).default('simple'),
  assumptions: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  completionCriteria: z.array(z.string().max(1_000)).default([]),
  estimatedExecutionTime: z.string().max(160).default(''),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export const aiWorkflowOutputSchema = canonicalWorkflowSchema.strict();

export const visualGraphSchema = z.object({
  nodes: z.array(z.object({ id: z.string(), position: z.object({ x: z.number(), y: z.number() }), data: z.object({ domainNodeId: z.string().uuid() }) })),
  edges: z.array(z.object({ id: z.string(), source: z.string(), target: z.string(), data: z.object({ domainConnectionId: z.string().uuid() }) }))
});

export const workflowReadinessSchema = z.enum(['draft', 'needs_clarification', 'platform_limited', 'build_ready']);
export const workflowSetStatusSchema = z.enum(['active', 'archived']);
export const workflowSetEntrySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  description: z.string().max(2_000).default(''),
  triggerSummary: z.string().max(1_000).default(''),
  platformSummary: z.string().max(1_000).default(''),
  readiness: workflowReadinessSchema.default('draft'),
  status: workflowSetStatusSchema.default('active'),
  applications: z.array(z.string().min(1).max(160)).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export const workflowOwnershipReferenceSchema = z.object({
  resourceId: z.string().uuid(),
  owningWorkflowId: z.string().uuid(),
  referencedByWorkflowIds: z.array(z.string().uuid()).default([])
});
export const workflowSetSchema = z.object({
  schemaVersion: z.literal('1.0'),
  workflows: z.array(workflowSetEntrySchema).min(1),
  nodeReferences: z.array(workflowOwnershipReferenceSchema).default([]),
  connectionReferences: z.array(workflowOwnershipReferenceSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((set, context) => {
  const workflowIds = new Set(set.workflows.map((workflow) => workflow.id));
  if (workflowIds.size !== set.workflows.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Workflow IDs must be unique.', path: ['workflows'] });
  for (const [collectionName, references] of [['nodeReferences', set.nodeReferences], ['connectionReferences', set.connectionReferences]] as const) {
    const resourceIds = new Set<string>();
    references.forEach((reference, index) => {
      if (resourceIds.has(reference.resourceId)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Resource ownership references must be unique.', path: [collectionName, index, 'resourceId'] });
      resourceIds.add(reference.resourceId);
      if (!workflowIds.has(reference.owningWorkflowId)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Owning workflow does not exist.', path: [collectionName, index, 'owningWorkflowId'] });
      if (reference.referencedByWorkflowIds.some((id) => !workflowIds.has(id))) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Shared workflow reference does not exist.', path: [collectionName, index, 'referencedByWorkflowIds'] });
    });
  }
});

export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  clientName: z.string().max(160).default(''),
  description: z.string().max(2_000).default(''),
  platform: platformSchema,
  status: projectStatusSchema,
  originalScope: z.string().max(100_000).default(''),
  workflow: canonicalWorkflowSchema,
  workflowSet: workflowSetSchema,
  visualGraph: visualGraphSchema.default({ nodes: [], edges: [] }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((project, context) => {
  const nodeIds = new Set(project.workflow.nodes.map((node) => node.id));
  const referencedNodeIds = new Set(project.workflowSet.nodeReferences.map((reference) => reference.resourceId));
  const connectionIds = new Set(project.workflow.connections.map((connection) => connection.id));
  const referencedConnectionIds = new Set(project.workflowSet.connectionReferences.map((reference) => reference.resourceId));
  if (nodeIds.size !== referencedNodeIds.size || [...nodeIds].some((id) => !referencedNodeIds.has(id))) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Every canonical node must have exactly one workflow ownership reference.', path: ['workflowSet', 'nodeReferences'] });
  if (connectionIds.size !== referencedConnectionIds.size || [...connectionIds].some((id) => !referencedConnectionIds.has(id))) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Every canonical connection must have exactly one workflow ownership reference.', path: ['workflowSet', 'connectionReferences'] });
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  clientName: z.string().trim().max(160).default(''),
  description: z.string().trim().max(2_000).default(''),
  platform: platformSchema
}).strict();

export const updateProjectScopeSchema = z.object({
  originalScope: z.string().max(100_000)
}).strict();

export const supportedDocumentTypeSchema = z.enum(['txt', 'md', 'pdf', 'docx', 'csv', 'json']);
export const extractedDocumentSchema = z.object({
  fileName: z.string(),
  fileType: supportedDocumentTypeSchema,
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  text: z.string().max(100_000),
  characterCount: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  warnings: z.array(z.string())
});

export const analyzeWorkflowRequestSchema = z.object({
  projectId: z.string().uuid(),
  workflowMode: z.enum(['auto', 'single']).default('auto'),
}).strict();
export const convertWorkflowRequestSchema = z.object({ projectId: z.string().uuid(), platform: platformSchema }).strict();
export const saveWorkflowEditorSchema = z.object({ workflow: canonicalWorkflowSchema, workflowSet: workflowSetSchema.optional(), visualGraph: visualGraphSchema }).strict();
export const workflowAnalysisResultSchema = z.object({
  workflow: canonicalWorkflowSchema,
  graphValidation: z.object({ valid: z.boolean(), errorCount: z.number().int().nonnegative(), warningCount: z.number().int().nonnegative() }),
  provider: z.enum(['local', 'openai', 'ollama']),
  analyzedAt: z.string().datetime(),
  detectedProcess: detectedProcessSummarySchema.optional(),
  plannerShadow: plannerShadowComparisonSchema.optional(),
  v21Analysis: v21AnalysisArtifactsSchema.optional(),
  v22ConceptualGraph: v22ConceptualGraphResultSchema.optional()
});
export const analysisProviderStatusSchema = z.object({ provider: z.enum(['local', 'openai', 'ollama']), available: z.boolean(), models: z.array(z.string()), message: z.string() });

export type Platform = z.infer<typeof platformSchema>;
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowConnection = z.infer<typeof workflowConnectionSchema>;
export type WorkflowBranch = z.infer<typeof workflowBranchSchema>;
export type ErrorHandlingRule = z.infer<typeof errorHandlingRuleSchema>;
export type DataMapping = z.infer<typeof dataMappingSchema>;
export type ClarificationQuestion = z.infer<typeof clarificationQuestionSchema>;
export type WorkflowRisk = z.infer<typeof workflowRiskSchema>;
export type CanonicalWorkflow = z.infer<typeof canonicalWorkflowSchema>;
export type WorkflowSetEntry = z.infer<typeof workflowSetEntrySchema>;
export type WorkflowOwnershipReference = z.infer<typeof workflowOwnershipReferenceSchema>;
export type WorkflowSet = z.infer<typeof workflowSetSchema>;
export type Project = z.infer<typeof projectSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectScopeInput = z.infer<typeof updateProjectScopeSchema>;
export type SupportedDocumentType = z.infer<typeof supportedDocumentTypeSchema>;
export type ExtractedDocument = z.infer<typeof extractedDocumentSchema>;
export type WorkflowAnalysisResult = z.infer<typeof workflowAnalysisResultSchema>;
export type AnalysisProviderStatus = z.infer<typeof analysisProviderStatusSchema>;

export type VisualGraphProjection = z.infer<typeof visualGraphSchema>;

export interface PlatformWorkflow<TNode = unknown, TConnection = unknown> {
  platform: Platform;
  sourceWorkflowId: string;
  nodes: TNode[];
  connections: TConnection[];
  warnings: string[];
}
