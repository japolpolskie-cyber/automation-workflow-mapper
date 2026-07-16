import { z } from 'zod';
import { canonicalWorkflowSchema } from './domain.js';

export const assistWorkflowRequestSchema = z.object({
  projectId: z.string().uuid(),
  command: z.string().trim().min(3).max(2_000),
  workflow: canonicalWorkflowSchema,
  selectedNodeId: z.string().uuid().nullable().default(null)
}).strict();

export const workflowPatchChangeSchema = z.object({
  type: z.enum(['add', 'update', 'remove', 'connect']),
  nodeId: z.string().uuid().nullable(),
  label: z.string(),
  detail: z.string()
});

export const workflowPatchProposalSchema = z.object({
  id: z.string().uuid(),
  command: z.string(),
  summary: z.string(),
  changes: z.array(workflowPatchChangeSchema),
  proposedWorkflow: canonicalWorkflowSchema,
  warnings: z.array(z.string()),
  validation: z.object({ valid: z.boolean(), errorCount: z.number().int().nonnegative(), warningCount: z.number().int().nonnegative() })
});

export type AssistWorkflowRequest = z.infer<typeof assistWorkflowRequestSchema>;
export type WorkflowPatchChange = z.infer<typeof workflowPatchChangeSchema>;
export type WorkflowPatchProposal = z.infer<typeof workflowPatchProposalSchema>;
