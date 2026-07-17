import {
  createCustomTemplateSchema,
  updateCustomTemplateSchema,
  type CustomWorkflowTemplate,
  type Project,
} from "@awm/shared";
import type { CustomTemplateRepository } from "../repositories/custom-template-repository.js";
import type { ProjectRepository } from "../repositories/project-repository.js";

export class CustomTemplateService {
  public constructor(
    private readonly templates: CustomTemplateRepository,
    private readonly projects: ProjectRepository,
  ) {}

  public list(): CustomWorkflowTemplate[] {
    return this.templates.list();
  }

  public create(input: unknown): CustomWorkflowTemplate {
    return this.templates.create(createCustomTemplateSchema.parse(input));
  }

  public update(id: string, input: unknown): CustomWorkflowTemplate | null {
    return this.templates.update(id, updateCustomTemplateSchema.parse(input));
  }

  public delete(id: string): boolean {
    return this.templates.delete(id);
  }

  public instantiate(id: string): Project | null {
    const template = this.templates.findById(id);
    if (!template) return null;
    const snapshot = structuredClone(template.snapshot);
    const project = this.projects.create({
      name: template.name,
      clientName: "",
      description: template.description,
      platform: snapshot.platform,
    });
    if (snapshot.originalScope)
      this.projects.updateScope(project.id, snapshot.originalScope);
    return this.projects.updateEditor(
      project.id,
      snapshot.workflow,
      snapshot.workflowSet,
      snapshot.visualGraph,
    );
  }
}
