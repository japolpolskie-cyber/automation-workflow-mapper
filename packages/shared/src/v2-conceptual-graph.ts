import { z } from 'zod';
import { plannerEdgeRoleSchema, plannerSemanticRoleSchema } from './semantic-role.js';
import { v21AnalysisArtifactsSchema } from './v2-analysis-contracts.js';

const sourceReferenceSchema = v21AnalysisArtifactsSchema.shape.requirementAnalysis.shape.entities.element.shape.sourceReferences.element;

export const v22ConceptualNodeSchema = z.object({
  id: z.string().min(1),
  role: plannerSemanticRoleSchema,
  title: z.string().min(1),
  purpose: z.string().min(1),
  capabilityGroupIds: z.array(z.string().min(1)),
  factIds: z.array(z.string().min(1)),
  evidenceIds: z.array(z.string().min(1)),
  sourceReferences: z.array(sourceReferenceSchema).min(1),
  confidence: z.number().min(0).max(1),
  lifecycleStage: z.string().nullable(),
  underlyingOperations: z.array(z.string().min(1)),
  collectionSource: z.string().min(1).nullable(),
  wait: z.object({
    resumeCondition: z.string().min(1),
    timeoutPolicy: z.string().min(1).nullable(),
    correlationIdentifier: z.string().min(1).nullable(),
  }).strict().nullable(),
  retry: z.object({
    maximumAttempts: z.number().int().positive(),
    backoff: z.string().min(1).nullable(),
  }).strict().nullable(),
  terminalOutcome: z.string().min(1).nullable(),
}).strict();

export const v22ConceptualEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  role: plannerEdgeRoleSchema,
  label: z.string().min(1),
  condition: z.string().min(1).nullable(),
  businessReason: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)),
  sourceReferences: z.array(sourceReferenceSchema).min(1),
}).strict();

export const v22ConceptualGraphSchema = z.object({
  version: z.literal('2.2'),
  shadowMode: z.literal(true),
  objective: z.string().min(1),
  entryNodeId: z.string().min(1),
  terminalNodeIds: z.array(z.string().min(1)).min(1),
  nodes: z.array(v22ConceptualNodeSchema).min(2),
  edges: z.array(v22ConceptualEdgeSchema).min(1),
  sourceV21Version: z.literal('2.1'),
  legacyK41Compatible: z.literal(true),
}).strict();

export const v22ValidationIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  nodeId: z.string().min(1).nullable(),
  edgeId: z.string().min(1).nullable(),
}).strict();

export const v22ConceptualGraphResultSchema = z.object({
  graph: v22ConceptualGraphSchema,
  validation: z.object({
    valid: z.boolean(),
    issues: z.array(v22ValidationIssueSchema),
  }).strict(),
}).strict();

export type V22ConceptualNode = z.infer<typeof v22ConceptualNodeSchema>;
export type V22ConceptualEdge = z.infer<typeof v22ConceptualEdgeSchema>;
export type V22ConceptualGraph = z.infer<typeof v22ConceptualGraphSchema>;
export type V22ValidationIssue = z.infer<typeof v22ValidationIssueSchema>;
export type V22ConceptualGraphResult = z.infer<typeof v22ConceptualGraphResultSchema>;
