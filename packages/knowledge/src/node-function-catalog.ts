import { workflowBriefEntityTypeSchema } from '@awm/shared';
import { z } from 'zod';

const idSchema = z.string().trim().min(1, 'ID must not be empty.');
const nameSchema = z.string().trim().min(1, 'Name must not be empty.');
const textSchema = z.string().trim().min(1);
const implementationLanguage = /\b(?:n8n|make(?:\.com)?|zapier|reactflow|nodeType|provider|modelId|runtime configuration)\b/i;

export const nodeFunctionCategorySchema = z.enum([
  'trigger', 'action', 'decision', 'routing', 'transformation', 'collection',
  'synchronization', 'timing', 'human', 'resilience', 'ai', 'orchestration', 'terminal',
]);
export const nodeFunctionStatusSchema = z.enum(['foundation', 'detailed', 'deprecated']);

export const nodeFunctionInputRequirementSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: textSchema,
  required: z.boolean(),
  clarificationQuestion: textSchema.optional(),
}).strict();

export const nodeFunctionOutputRequirementSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: textSchema,
  minimumCount: z.number().int().nonnegative().optional(),
  maximumCount: z.number().int().nonnegative().optional(),
  semanticLabelRequired: z.boolean(),
  genericLabelsAllowed: z.boolean(),
}).strict().superRefine((output, context) => {
  if (output.minimumCount !== undefined && output.maximumCount !== undefined && output.maximumCount < output.minimumCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'maximumCount must be greater than or equal to minimumCount.', path: ['maximumCount'] });
  }
});

export const nodeFunctionSafeguardSchema = z.object({
  id: idSchema,
  description: textSchema,
  reason: textSchema,
}).strict();

export const nodeFunctionExampleSchema = z.object({
  requirementText: textSchema,
  expectedInterpretation: textSchema,
  valid: z.boolean(),
}).strict();

const uniqueNestedIds = (items: readonly { id: string }[], path: string, context: z.RefinementCtx) => {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate ${path} ID "${item.id}" is not allowed.`, path: [path, index, 'id'] });
    seen.add(item.id);
  });
};

export const nodeFunctionContractSchema = z.object({
  id: idSchema,
  name: nameSchema,
  category: nodeFunctionCategorySchema,
  status: nodeFunctionStatusSchema,
  purpose: textSchema,
  selectionCriteria: z.array(textSchema).min(1),
  exclusionCriteria: z.array(textSchema).min(1),
  inputRequirements: z.array(nodeFunctionInputRequirementSchema),
  outputRequirements: z.array(nodeFunctionOutputRequirementSchema),
  safeguards: z.array(nodeFunctionSafeguardSchema),
  positiveExamples: z.array(nodeFunctionExampleSchema).min(1),
  negativeExamples: z.array(nodeFunctionExampleSchema).min(1),
  relatedWorkflowBriefEntityTypes: z.array(workflowBriefEntityTypeSchema),
  notes: z.array(textSchema),
}).strict().superRefine((contract, context) => {
  uniqueNestedIds(contract.inputRequirements, 'inputRequirements', context);
  uniqueNestedIds(contract.outputRequirements, 'outputRequirements', context);
  uniqueNestedIds(contract.safeguards, 'safeguards', context);
  if (contract.status === 'detailed' && contract.inputRequirements.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Detailed contracts require at least one input requirement.', path: ['inputRequirements'] });
  if (contract.status === 'detailed' && contract.outputRequirements.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Detailed contracts require at least one output requirement.', path: ['outputRequirements'] });
  if (contract.positiveExamples.some((example) => !example.valid)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Positive examples must be marked valid.', path: ['positiveExamples'] });
  if (contract.negativeExamples.some((example) => example.valid)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Negative examples must be marked invalid.', path: ['negativeExamples'] });
  if (new Set(contract.relatedWorkflowBriefEntityTypes).size !== contract.relatedWorkflowBriefEntityTypes.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Related Workflow Brief entity types must be unique.', path: ['relatedWorkflowBriefEntityTypes'] });
  if (implementationLanguage.test(JSON.stringify(contract))) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Node-function contracts must not contain platform or runtime implementation language.', path: [] });
});

export const nodeFunctionCatalogSchema = z.array(nodeFunctionContractSchema).superRefine((contracts, context) => {
  const seen = new Set<string>();
  contracts.forEach((contract, index) => {
    if (seen.has(contract.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate node-function contract ID "${contract.id}" is not allowed.`, path: [index, 'id'] });
    seen.add(contract.id);
  });
});

export const routerNodeFunctionContract: NodeFunctionContract = {
  id: 'router',
  name: 'Router',
  category: 'routing',
  status: 'detailed',
  purpose: 'Route one workflow execution into one of several business outcomes based on mutually distinguishable conditions.',
  selectionCriteria: [
    'The requirement contains three or more business outcomes.',
    'Outcomes are named departments, statuses, categories, priorities, regions, products, request types, or other semantic destinations.',
    'The requirement explicitly describes routing, categorization, distribution, or choosing among multiple outcomes.',
    'A fallback or unmatched business route may be required.',
  ],
  exclusionCriteria: [
    'Exactly two outcomes are better represented as a binary decision.',
    'Parallel branches that must all execute are not mutually exclusive routing.',
    'Item-by-item collection processing belongs to an iterator.',
    'Retry or loop-back behavior belongs to a loop contract.',
    'Downstream action names alone do not establish a business routing decision.',
  ],
  inputRequirements: [
    { id: 'routing-subject', name: 'Routing subject', description: 'The request, record, case, or other business item being routed.', required: true, clarificationQuestion: 'What business item is being routed?' },
    { id: 'routing-basis', name: 'Routing basis', description: 'The condition or business attribute that distinguishes outcomes.', required: true, clarificationQuestion: 'Which condition determines the matching route?' },
    { id: 'business-outcomes', name: 'Expected business outcomes', description: 'The mutually distinguishable outcomes available to the routing decision.', required: true, clarificationQuestion: 'What are the named business outcomes?' },
    { id: 'fallback-behavior', name: 'Fallback behavior', description: 'The outcome for an unmatched subject when a fallback is relevant.', required: false, clarificationQuestion: 'What should happen when no route condition matches?' },
  ],
  outputRequirements: [
    { id: 'semantic-routes', name: 'Semantic business routes', description: 'At least two routes with stable business labels.', minimumCount: 2, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'route-meaning', name: 'Route condition or meaning', description: 'The business condition that selects each route.', minimumCount: 2, semanticLabelRequired: false, genericLabelsAllowed: false },
    { id: 'route-target', name: 'Target business outcome', description: 'The business outcome or next action reached by each route.', minimumCount: 2, semanticLabelRequired: false, genericLabelsAllowed: false },
    { id: 'fallback-route', name: 'Fallback route', description: 'An optional unmatched outcome when the listed routes are not exhaustive.', minimumCount: 0, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'no-sequential-inference', description: 'Do not infer a Router from a list of sequential actions.', reason: 'Sequence does not imply mutually exclusive selection.' },
    { id: 'stable-route-semantics', description: 'Do not use destination action names as route semantics.', reason: 'A route describes why an outcome is selected, independently of the downstream action title.' },
    { id: 'no-generic-routes', description: 'Do not create generic numbered routes in a locked Workflow Brief.', reason: 'Every locked route must preserve a meaningful business outcome.' },
    { id: 'exclude-parallel', description: 'Do not treat parallel execution as mutually exclusive routing.', reason: 'Parallel branches may all execute, while a Router selects an outcome.' },
    { id: 'bounded-fallback', description: 'Do not force a fallback when the requirement provides complete exhaustive outcomes.', reason: 'Fallback behavior must reflect an actual unmatched possibility.' },
    { id: 'clarify-overlap', description: 'Request clarification when outcomes overlap or routing conditions are missing.', reason: 'Overlapping or absent conditions do not define a deterministic selection.' },
  ],
  positiveExamples: [
    { requirementText: 'Route incoming requests to IT, Marketing, or Customer Support.', expectedInterpretation: 'Route by responsible department using IT, Marketing, and Customer Support labels.', valid: true },
    { requirementText: 'Classify invoices as Paid, Pending, or Overdue.', expectedInterpretation: 'Route by invoice status using Paid, Pending, and Overdue labels.', valid: true },
    { requirementText: 'Send high-priority cases to escalation, medium-priority cases to review, and low-priority cases to the standard queue.', expectedInterpretation: 'Route by priority using High Priority, Medium Priority, and Low Priority labels.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'If approved, continue; otherwise stop.', expectedInterpretation: 'Use a binary decision.', valid: false },
    { requirementText: 'Send the same message to chat and email.', expectedInterpretation: 'Use parallel fan-out, not mutually exclusive routing.', valid: false },
    { requirementText: 'For each attachment, save the file.', expectedInterpretation: 'Use an iterator.', valid: false },
    { requirementText: 'Retry twice if delivery fails.', expectedInterpretation: 'Use a retry loop.', valid: false },
    { requirementText: 'Create a Finance ticket.', expectedInterpretation: 'Use an action; no routing decision is present.', valid: false },
    { requirementText: 'Create Output 1 and Output 2.', expectedInterpretation: 'Reject generic numbered route labels.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['decision', 'route'],
  notes: ['Route labels remain stable when a downstream action is renamed.'],
};

type FoundationSeed = { id: string; name: string; category: NodeFunctionCategory; entities: NodeFunctionContract['relatedWorkflowBriefEntityTypes'] };
const foundationSeeds: FoundationSeed[] = [
  { id: 'trigger', name: 'Trigger', category: 'trigger', entities: ['trigger'] },
  { id: 'action', name: 'Action', category: 'action', entities: ['action'] },
  { id: 'binary-decision', name: 'Binary Decision', category: 'decision', entities: ['decision', 'route'] },
  { id: 'filter', name: 'Filter', category: 'decision', entities: ['decision', 'route'] },
  { id: 'iterator', name: 'Iterator', category: 'collection', entities: ['iterator'] },
  { id: 'aggregator', name: 'Aggregator', category: 'collection', entities: ['aggregator'] },
  { id: 'merge', name: 'Merge', category: 'synchronization', entities: ['merge'] },
  { id: 'wait', name: 'Wait', category: 'timing', entities: ['wait'] },
  { id: 'approval', name: 'Approval', category: 'human', entities: ['approval'] },
  { id: 'retry', name: 'Retry', category: 'resilience', entities: ['loop'] },
  { id: 'follow-up-loop', name: 'Follow-up Loop', category: 'timing', entities: ['loop'] },
  { id: 'revision-loop', name: 'Revision Loop', category: 'human', entities: ['loop'] },
  { id: 'polling-loop', name: 'Polling Loop', category: 'timing', entities: ['loop'] },
  { id: 'return-to-step-loop', name: 'Return-to-step Loop', category: 'orchestration', entities: ['loop'] },
  { id: 'error-handler', name: 'Error Handler', category: 'resilience', entities: ['capability'] },
  { id: 'sub-workflow', name: 'Sub-workflow', category: 'orchestration', entities: ['capability'] },
  { id: 'terminal', name: 'Terminal', category: 'terminal', entities: ['action'] },
  { id: 'ai-agent', name: 'AI Agent', category: 'ai', entities: ['capability'] },
  { id: 'ai-classification', name: 'AI Classification', category: 'ai', entities: ['capability'] },
  { id: 'ai-extraction', name: 'AI Extraction', category: 'ai', entities: ['capability'] },
  { id: 'ai-summarization', name: 'AI Summarization', category: 'ai', entities: ['capability'] },
  { id: 'ai-generation', name: 'AI Generation', category: 'ai', entities: ['capability'] },
];

const foundationContract = (seed: FoundationSeed): NodeFunctionContract => ({
  id: seed.id,
  name: seed.name,
  category: seed.category,
  status: 'foundation',
  purpose: `Represent the conceptual business function ${seed.name}.`,
  selectionCriteria: [`Use when the reviewed business requirement explicitly needs ${seed.name}.`],
  exclusionCriteria: [`Do not use when the requirement does not establish ${seed.name} behavior.`],
  inputRequirements: [], outputRequirements: [], safeguards: [],
  positiveExamples: [{ requirementText: `The process explicitly requires ${seed.name}.`, expectedInterpretation: `Record ${seed.name} as a conceptual function for later detailed review.`, valid: true }],
  negativeExamples: [{ requirementText: `The process does not require ${seed.name}.`, expectedInterpretation: `Do not select ${seed.name}.`, valid: false }],
  relatedWorkflowBriefEntityTypes: seed.entities,
  notes: ['Detailed behavior is intentionally deferred.'],
});

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
};

const internalNodeFunctionCatalog = deepFreeze(nodeFunctionCatalogSchema.parse([
  ...foundationSeeds.map(foundationContract),
  routerNodeFunctionContract,
]));

export function parseNodeFunctionContract(input: unknown): NodeFunctionContract {
  return nodeFunctionContractSchema.parse(input);
}

export function safeParseNodeFunctionContract(input: unknown) {
  return nodeFunctionContractSchema.safeParse(input);
}

export function getNodeFunctionContract(id: string): NodeFunctionContract | undefined {
  const normalizedId = id.trim().toLowerCase();
  const contract = internalNodeFunctionCatalog.find((item) => item.id === normalizedId);
  return contract ? structuredClone(contract) : undefined;
}

export function listNodeFunctionContracts(): NodeFunctionContract[] {
  return structuredClone(internalNodeFunctionCatalog);
}

export function hasNodeFunctionContract(id: string): boolean {
  return internalNodeFunctionCatalog.some((item) => item.id === id.trim().toLowerCase());
}

export type NodeFunctionCategory = z.infer<typeof nodeFunctionCategorySchema>;
export type NodeFunctionStatus = z.infer<typeof nodeFunctionStatusSchema>;
export type NodeFunctionInputRequirement = z.infer<typeof nodeFunctionInputRequirementSchema>;
export type NodeFunctionOutputRequirement = z.infer<typeof nodeFunctionOutputRequirementSchema>;
export type NodeFunctionSafeguard = z.infer<typeof nodeFunctionSafeguardSchema>;
export type NodeFunctionExample = z.infer<typeof nodeFunctionExampleSchema>;
export type NodeFunctionContract = z.infer<typeof nodeFunctionContractSchema>;
