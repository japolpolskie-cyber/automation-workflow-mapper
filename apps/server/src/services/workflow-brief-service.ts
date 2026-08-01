import { z } from 'zod';
import { assembleDraftWorkflowBrief, type AssembleDraftWorkflowBriefInput } from '../workflow-brief/draft-workflow-brief-assembler.js';

const draftWorkflowBriefInputSchema = z.object({
  sourceRequirement: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
  summary: z.string().trim().min(1).optional(),
  objective: z.string().trim().min(1).optional(),
}).strict();

export type DraftWorkflowBriefInput = z.infer<typeof draftWorkflowBriefInputSchema>;

export function generateDraftWorkflowBrief(input: AssembleDraftWorkflowBriefInput) {
  return assembleDraftWorkflowBrief(draftWorkflowBriefInputSchema.parse(input));
}

export class WorkflowBriefService {
  generateDraft(input: unknown) {
    return generateDraftWorkflowBrief(draftWorkflowBriefInputSchema.parse(input));
  }
}

