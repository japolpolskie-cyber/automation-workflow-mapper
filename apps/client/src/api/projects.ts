import type {
  AnalysisProviderStatus,
  ApiResponse,
  CreateCustomTemplateInput,
  CreateProjectInput,
  CustomWorkflowTemplate,
  Platform,
  PlatformBuildPlan,
  Project,
  UpdateCustomTemplateInput,
  WorkflowAnalysisResult,
  SubmittedClarificationAnswer,
  WorkflowPatchProposal,
  WorkflowValidationResult,
} from "@awm/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(
      "The local application service is unavailable. Confirm the server is running, then try again.",
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json"))
    throw new Error(
      response.ok
        ? "The server returned an unexpected response."
        : `The server could not complete the request (${response.status}).`,
    );
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.success)
    throw new Error(
      payload.success
        ? `The server could not complete the request (${response.status}).`
        : (payload.error?.message ?? "The request could not be completed."),
    );
  return payload.data;
}

export const projectApi = {
  list: () => request<Project[]>("/workflows"),
  listArchived: () => request<Project[]>("/workflows/archived"),
  get: (id: string) => request<Project>(`/workflows/${id}`),
  create: (input: CreateProjectInput) =>
    request<Project>("/workflows", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateScope: (id: string, originalScope: string) =>
    request<Project>(`/workflows/${id}/scope`, {
      method: "PATCH",
      body: JSON.stringify({ originalScope }),
    }),
  archive: (id: string) =>
    request<Project>(`/workflows/${id}/archive`, {
      method: "PATCH",
      body: JSON.stringify({}),
    }),
  restore: (id: string) =>
    request<Project>(`/workflows/${id}/restore`, {
      method: "PATCH",
      body: JSON.stringify({}),
    }),
  delete: (id: string) =>
    request<Project>(`/workflows/${id}`, {
      method: "DELETE",
    }),
  updateEditor: (
    id: string,
    workflow: Project["workflow"],
    workflowSet: Project["workflowSet"],
    visualGraph: Project["visualGraph"],
  ) =>
    request<Project>(`/workflows/${id}/editor`, {
      method: "PATCH",
      body: JSON.stringify({ workflow, workflowSet, visualGraph }),
    }),
  analyze: (projectId: string, workflowMode: "auto" | "single" = "auto", clarificationAnswers?: SubmittedClarificationAnswer[]) =>
    request<WorkflowAnalysisResult>("/workflows/analyze", {
      method: "POST",
      body: JSON.stringify({ projectId, workflowMode, ...(clarificationAnswers?.length ? { clarificationAnswers } : {}) }),
    }),
  convert: (projectId: string, platform: Platform) =>
    request<PlatformBuildPlan>("/workflows/convert", {
      method: "POST",
      body: JSON.stringify({ projectId, platform }),
    }),
  validate: (projectId: string, platform: Platform) =>
    request<WorkflowValidationResult>("/workflows/validate", {
      method: "POST",
      body: JSON.stringify({ projectId, platform }),
    }),
  assist: (
    projectId: string,
    command: string,
    workflow: Project["workflow"],
    selectedNodeId: string | null,
  ) =>
    request<WorkflowPatchProposal>("/workflows/assist", {
      method: "POST",
      body: JSON.stringify({ projectId, command, workflow, selectedNodeId }),
    }),
  analysisStatus: () => request<AnalysisProviderStatus>("/ai/status"),
};

export const customTemplateApi = {
  list: () => request<CustomWorkflowTemplate[]>("/custom-templates"),
  create: (input: CreateCustomTemplateInput) =>
    request<CustomWorkflowTemplate>("/custom-templates", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, input: UpdateCustomTemplateInput) =>
    request<CustomWorkflowTemplate>(`/custom-templates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  delete: (id: string) =>
    request<{ deleted: true }>(`/custom-templates/${id}`, { method: "DELETE" }),
  use: (id: string) =>
    request<Project>(`/custom-templates/${id}/use`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
};

export { request };
