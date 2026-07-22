import { z } from 'zod';
import { distributedPlannerPlatformSchema } from './distributed-planner.js';
import { symbolTableSchema } from './controlled-vocabulary.js';
import { plannerDataShapeSchema, plannerEdgeRoleSchema, plannerSemanticRoleSchema, semanticRoleSlotSchema } from './semantic-role.js';
import { plannerRetrievalContextSchema } from './planner.js';

export const p36ContractVersion = '3.6.0' as const;
export const p37SkeletonContractVersion = '3.7.0' as const;
const symbol = z.number().int().positive();

const compactFactSchema = z.object({
  symbol,
  kind: z.enum(['application', 'entity', 'business_verb', 'decision', 'route', 'repetition', 'cardinality', 'workflow_function']),
  value: z.string().min(1),
  entity: z.string().nullable(),
  evidenceSymbols: z.array(symbol),
}).strict();
const compactClarificationSchema = z.object({
  symbol,
  category: z.string().min(1),
  question: z.string().min(1),
  missingFact: z.string().min(1),
  evidenceSymbols: z.array(symbol),
}).strict();
const compactPatternSchema = z.object({
  symbol,
  title: z.string().min(1),
  requiredSignals: z.array(z.string()),
  canonicalFunctionSymbols: z.array(symbol),
}).strict();

export const p36BusinessIntentInputSchema = z.object({
  contractVersion: z.literal(p36ContractVersion),
  runId: z.string().min(1),
  rawScope: z.string().min(1),
  platform: distributedPlannerPlatformSchema,
  symbolTable: symbolTableSchema,
  facts: z.array(compactFactSchema),
  clarifications: z.array(compactClarificationSchema),
  patterns: z.array(compactPatternSchema),
  retrievalContext: plannerRetrievalContextSchema.optional(),
}).strict();

export const p36BusinessIntentOutputSchema = z.object({
  businessObjective: z.string().min(1),
  actors: z.array(z.string().min(1)),
  sourceApplicationSymbols: z.array(symbol),
  destinationApplicationSymbols: z.array(symbol),
  unresolvedSystems: z.array(z.string().min(1)),
  businessEntities: z.array(z.string().min(1)),
  businessOutcomes: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
  explicitBusinessRules: z.array(z.string().min(1)),
  unresolvedClarificationSymbols: z.array(symbol),
  decompositionHints: z.array(z.string().min(1)),
  factSymbols: z.array(symbol),
  patternSymbols: z.array(symbol),
  workflowBoundaryCandidates: z.array(z.object({
    title: z.string().min(1),
    purpose: z.string().min(1),
    factSymbols: z.array(symbol),
  }).strict()).min(1),
}).strict();

export const p36WorkflowSkeletonInputSchema = z.object({
  contractVersion: z.literal(p37SkeletonContractVersion),
  runId: z.string().min(1),
  platform: distributedPlannerPlatformSchema,
  symbolTable: symbolTableSchema,
  intent: p36BusinessIntentOutputSchema,
  facts: z.array(compactFactSchema),
  clarifications: z.array(compactClarificationSchema),
  patterns: z.array(compactPatternSchema),
  roleSlots: z.array(semanticRoleSlotSchema).min(1),
  topologyConstraints: z.array(z.string().min(1)),
}).strict();

const nodeSchema = z.object({
  roleSlotIndex: z.number().int().nonnegative(),
  semanticRole: plannerSemanticRoleSchema,
  canonicalFunctionSymbol: symbol,
  inputShape: plannerDataShapeSchema,
  outputShape: plannerDataShapeSchema,
  title: z.string().min(1),
  factSymbols: z.array(symbol),
  evidenceSymbols: z.array(symbol),
  knowledgeSymbols: z.array(symbol),
  blockedByClarificationSymbols: z.array(symbol),
  unresolvedGroundingRequirements: z.array(z.string().min(1)),
}).strict();
const edgeSchema = z.object({
  sourceIndex: z.number().int().nonnegative(),
  targetIndex: z.number().int().nonnegative(),
  label: z.string().min(1),
  role: plannerEdgeRoleSchema,
  condition: z.string().nullable(),
  evidenceSymbols: z.array(symbol),
}).strict();

export const p36WorkflowSkeletonOutputSchema = z.object({
  workflows: z.array(z.object({
    title: z.string().min(1),
    boundaryIndex: z.number().int().nonnegative(),
    entryNodeIndex: z.number().int().nonnegative(),
    exitNodeIndexes: z.array(z.number().int().nonnegative()).min(1),
    nodes: z.array(nodeSchema).min(1),
    edges: z.array(edgeSchema),
    binaryConditions: z.array(z.object({
      nodeIndex: z.number().int().nonnegative(),
      trueEdgeIndex: z.number().int().nonnegative(),
      falseEdgeIndex: z.number().int().nonnegative(),
    }).strict()),
    routers: z.array(z.object({
      nodeIndex: z.number().int().nonnegative(),
      routes: z.array(z.object({
        label: z.string().min(1),
        condition: z.string().min(1),
        destinationNodeIndex: z.number().int().nonnegative(),
        edgeIndex: z.number().int().nonnegative(),
      }).strict()).min(2),
    }).strict()),
    loops: z.array(z.object({
      nodeIndex: z.number().int().nonnegative(),
      entryEdgeIndex: z.number().int().nonnegative(),
      bodyEntryNodeIndex: z.number().int().nonnegative(),
      bodyExitNodeIndex: z.number().int().nonnegative(),
      exitEdgeIndex: z.number().int().nonnegative(),
      stopBoundary: z.string().min(1),
    }).strict()),
    merges: z.array(z.object({
      nodeIndex: z.number().int().nonnegative(),
      incomingEdgeIndexes: z.array(z.number().int().nonnegative()).min(2),
      continuationEdgeIndex: z.number().int().nonnegative(),
    }).strict()),
    aggregators: z.array(z.object({
      nodeIndex: z.number().int().nonnegative(),
      itemSourceNodeIndex: z.number().int().nonnegative(),
      aggregationMethod: z.string().min(1),
      continuationEdgeIndex: z.number().int().nonnegative(),
    }).strict()),
    retries: z.array(z.object({
      nodeIndex: z.number().int().nonnegative(),
      failedOperationNodeIndex: z.number().int().nonnegative(),
      retryEdgeIndex: z.number().int().nonnegative(),
      exhaustedEdgeIndex: z.number().int().nonnegative(),
      attemptLimit: z.number().int().positive().nullable(),
      missingLimitClarificationSymbol: symbol.nullable(),
    }).strict()),
    blockingClarificationSymbols: z.array(symbol),
  }).strict()).min(1),
}).strict();

export type P36BusinessIntentInput = z.infer<typeof p36BusinessIntentInputSchema>;
export type P36BusinessIntentOutput = z.infer<typeof p36BusinessIntentOutputSchema>;
export type P36WorkflowSkeletonInput = z.infer<typeof p36WorkflowSkeletonInputSchema>;
export type P36WorkflowSkeletonOutput = z.infer<typeof p36WorkflowSkeletonOutputSchema>;
