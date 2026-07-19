import { z } from 'zod';
import { v22ConceptualGraphSchema } from './v2-conceptual-graph.js';

const sourceReferenceSchema = v22ConceptualGraphSchema.shape.nodes.element.shape.sourceReferences.element;
const translationPlatformSchema = z.enum(['zapier', 'make', 'n8n']);

export const translationWarningSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(['warning', 'error']),
  kind: z.enum(['unsupported-feature', 'lossy-translation', 'platform-limitation', 'missing-operation']),
  message: z.string().min(1),
  conceptualNodeIds: z.array(z.string().min(1)),
  capabilityRefs: z.array(z.string().min(1)),
}).strict();

export const translatedImplementationNodeSchema = z.object({
  id: z.string().min(1),
  platform: translationPlatformSchema,
  primitiveKind: z.enum(['platform-node', 'canonical-boundary']),
  primitiveType: z.string().min(1),
  label: z.string().min(1),
  event: z.string().min(1).nullable(),
  conceptualNodeIds: z.array(z.string().min(1)).min(1),
  capabilityGroupIds: z.array(z.string().min(1)),
  capabilityRefs: z.array(z.string().min(1)),
  applicationId: z.string().min(1).nullable(),
  operationId: z.string().min(1).nullable(),
  configuration: z.record(z.unknown()),
  evidenceIds: z.array(z.string().min(1)),
  sourceReferences: z.array(sourceReferenceSchema).min(1),
  lifecycleStage: z.string().nullable(),
  underlyingOperations: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
}).strict();

export const translatedImplementationEdgeSchema = z.object({
  id: z.string().min(1),
  platform: translationPlatformSchema,
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().min(1),
  condition: z.string().min(1).nullable(),
  conceptualEdgeIds: z.array(z.string().min(1)),
  evidenceIds: z.array(z.string().min(1)),
  sourceReferences: z.array(sourceReferenceSchema).min(1),
}).strict();

export const implementationUnitSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['node', 'composite', 'metadata', 'continuation', 'terminal']),
  conceptualNodeIds: z.array(z.string().min(1)).min(1),
  entryNodeId: z.string().min(1),
  exitNodeId: z.string().min(1),
  implementationNodeIds: z.array(z.string().min(1)).min(1),
  purpose: z.string().min(1),
}).strict();

export const platformTranslationResultSchema = z.object({
  version: z.enum(['2.3A', '2.3B', '2.3C']),
  shadowMode: z.literal(true),
  selectedPlatform: translationPlatformSchema,
  sourceGraphVersion: z.literal('2.2'),
  sourceEntryNodeId: z.string().min(1),
  nodes: z.array(translatedImplementationNodeSchema).min(1),
  edges: z.array(translatedImplementationEdgeSchema),
  units: z.array(implementationUnitSchema).min(1),
  warnings: z.array(translationWarningSchema),
  diagnostics: z.object({
    conceptualNodeCount: z.number().int().nonnegative(),
    translatedNodeCount: z.number().int().nonnegative(),
    translatedEdgeCount: z.number().int().nonnegative(),
    unsupportedFeatureCount: z.number().int().nonnegative(),
    lossyTranslationCount: z.number().int().nonnegative(),
    platformLeakageCount: z.number().int().nonnegative(),
    invalidOperationReferenceCount: z.number().int().nonnegative(),
    valid: z.boolean(),
  }).strict(),
}).strict();

export type TranslationWarning = z.infer<typeof translationWarningSchema>;
export type TranslatedImplementationNode = z.infer<typeof translatedImplementationNodeSchema>;
export type TranslatedImplementationEdge = z.infer<typeof translatedImplementationEdgeSchema>;
export type ImplementationUnit = z.infer<typeof implementationUnitSchema>;
export type PlatformTranslationResult = z.infer<typeof platformTranslationResultSchema>;
