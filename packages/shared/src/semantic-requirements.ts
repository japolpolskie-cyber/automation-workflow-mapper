import { z } from 'zod';

export const semanticRequirementKindSchema = z.enum([
  'authoring-instruction',
  'authoring-constraint',
  'trigger',
  'operation',
  'ai-agent',
  'ai-resource',
  'router',
  'route',
  'binary-condition',
  'branch',
  'sequence',
  'temporal-wait',
  'event-wait',
  'terminal-outcome',
]);

export const semanticRequirementUnitSchema = z.object({
  id: z.string().min(1),
  kind: semanticRequirementKindSchema,
  text: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  executable: z.boolean(),
  parentId: z.string().min(1).nullable(),
  branchLabel: z.enum(['TRUE', 'FALSE']).nullable(),
}).strict();

export const semanticRequirementAnalysisSchema = z.object({
  version: z.literal('1.0'),
  shadowMode: z.literal(true),
  units: z.array(semanticRequirementUnitSchema),
}).strict();

export type SemanticRequirementKind = z.infer<typeof semanticRequirementKindSchema>;
export type SemanticRequirementUnit = z.infer<typeof semanticRequirementUnitSchema>;
export type SemanticRequirementAnalysis = z.infer<typeof semanticRequirementAnalysisSchema>;
