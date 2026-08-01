import { safeParseCanonicalWorkflowBrief, type CanonicalWorkflowBrief } from '@awm/shared';
import { request } from './projects';

export interface WorkflowBriefDetectionSummary {
  candidateCount: number;
  detectedFunctions: string[];
  clarificationCount: number;
}

export interface DraftWorkflowBriefResponse {
  brief: CanonicalWorkflowBrief;
  detectionSummary: WorkflowBriefDetectionSummary;
}

const isDetectionSummary = (value: unknown): value is WorkflowBriefDetectionSummary => {
  if (!value || typeof value !== 'object') return false;
  const summary = value as Partial<WorkflowBriefDetectionSummary>;
  return Number.isInteger(summary.candidateCount) && Number(summary.candidateCount) >= 0
    && Array.isArray(summary.detectedFunctions) && summary.detectedFunctions.every((item) => typeof item === 'string')
    && Number.isInteger(summary.clarificationCount) && Number(summary.clarificationCount) >= 0;
};

export const workflowBriefApi = {
  async generateDraft(sourceRequirement: string): Promise<DraftWorkflowBriefResponse> {
    const response = await request<unknown>('/internal/workflow-brief/draft', {
      method: 'POST',
      body: JSON.stringify({ sourceRequirement }),
    });
    if (!response || typeof response !== 'object') throw new Error('The server returned an invalid Workflow Brief response.');
    const candidate = response as { brief?: unknown; detectionSummary?: unknown };
    const parsedBrief = safeParseCanonicalWorkflowBrief(candidate.brief);
    if (!parsedBrief.success || !isDetectionSummary(candidate.detectionSummary)) {
      throw new Error('The server returned an invalid Workflow Brief response.');
    }
    return { brief: parsedBrief.data, detectionSummary: candidate.detectionSummary };
  },
};

