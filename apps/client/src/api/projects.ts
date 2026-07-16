import type { AnalysisProviderStatus, ApiResponse, CreateProjectInput, Platform, PlatformBuildPlan, Project, WorkflowAnalysisResult, WorkflowPatchProposal, WorkflowValidationResult } from '@awm/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init?.headers } });
  const payload = await response.json() as ApiResponse<T>;
  if (!payload.success) throw new Error(payload.error.message);
  return payload.data;
}

export const projectApi = {
  list: () => request<Project[]>('/workflows'),
  get: (id: string) => request<Project>(`/workflows/${id}`),
  create: (input: CreateProjectInput) => request<Project>('/workflows', { method: 'POST', body: JSON.stringify(input) }),
  updateScope: (id: string, originalScope: string) => request<Project>(`/workflows/${id}/scope`, { method: 'PATCH', body: JSON.stringify({ originalScope }) }),
  updateEditor: (id: string, workflow: Project['workflow'], visualGraph: Project['visualGraph']) => request<Project>(`/workflows/${id}/editor`, { method: 'PATCH', body: JSON.stringify({ workflow, visualGraph }) }),
  analyze: (projectId: string) => request<WorkflowAnalysisResult>('/workflows/analyze', { method: 'POST', body: JSON.stringify({ projectId }) }),
  convert: (projectId: string, platform: Platform) => request<PlatformBuildPlan>('/workflows/convert', { method: 'POST', body: JSON.stringify({ projectId, platform }) }),
  validate: (projectId: string, platform: Platform) => request<WorkflowValidationResult>('/workflows/validate', { method: 'POST', body: JSON.stringify({ projectId, platform }) }),
  assist: (projectId: string, command: string, workflow: Project['workflow'], selectedNodeId: string | null) => request<WorkflowPatchProposal>('/workflows/assist', { method: 'POST', body: JSON.stringify({ projectId, command, workflow, selectedNodeId }) }),
  analysisStatus: () => request<AnalysisProviderStatus>('/ai/status')
};

export { request };
