import { applyVisualTopology, createProjectSchema, saveWorkflowEditorSchema, updateProjectScopeSchema, validateWorkflowGraph, type CreateProjectInput, type Project } from '@awm/shared';
import type { ProjectRepository } from '../repositories/project-repository.js';

export class ProjectService {
  public constructor(private readonly repository: ProjectRepository) {}
  public listProjects(): Project[] { return this.repository.list(); }
  public listArchivedProjects(): Project[] { return this.repository.listArchived(); }
  public getProject(id: string): Project | null { return this.repository.findById(id); }
  public createProject(input: CreateProjectInput): Project { return this.repository.create(createProjectSchema.parse(input)); }
  public updateScope(id: string, input: unknown): Project | null { return this.repository.updateScope(id, updateProjectScopeSchema.parse(input).originalScope); }
  public archiveProject(id: string): Project | null { return this.repository.archive(id); }
  public restoreProject(id: string): Project | null { return this.repository.restore(id); }
  public updateEditor(id: string, input: unknown): Project | null {
    const parsed = saveWorkflowEditorSchema.parse(input);
    const visibleNodeIds = new Set(parsed.visualGraph.nodes.map((node) => node.data.domainNodeId));
    const workflow = applyVisualTopology({ ...parsed.workflow, nodes: parsed.workflow.nodes.filter((node) => visibleNodeIds.has(node.id)) }, parsed.visualGraph);
    const validation = validateWorkflowGraph(workflow);
    if (!validation.valid) throw new Error(`Workflow editor graph is invalid: ${validation.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message).join('; ')}`);
    return this.repository.updateEditor(id, workflow, parsed.workflowSet, parsed.visualGraph);
  }
}
