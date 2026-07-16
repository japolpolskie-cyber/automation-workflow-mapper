import { buildPlatformPlan } from '@awm/platforms';
import { convertWorkflowRequestSchema, validateWorkflow, type PlatformBuildPlan, type WorkflowValidationResult } from '@awm/shared';
import type { ProjectRepository } from '../repositories/project-repository.js';
import { AnalysisError } from './analysis-service.js';

export class PlatformService {
  public constructor(private readonly repository: ProjectRepository) {}
  public convert(input: unknown): PlatformBuildPlan {
    const request = convertWorkflowRequestSchema.parse(input);
    const project = this.repository.findById(request.projectId);
    if (!project) throw new AnalysisError('PROJECT_NOT_FOUND', 'The workflow project was not found.', 404);
    if (!project.workflow.nodes.length) throw new AnalysisError('WORKFLOW_REQUIRED', 'Analyze the scope before generating a platform build plan.', 400);
    return buildPlatformPlan(request.platform, project.workflow);
  }
  public validate(input: unknown): WorkflowValidationResult {
    const request = convertWorkflowRequestSchema.parse(input);
    const project = this.repository.findById(request.projectId);
    if (!project) throw new AnalysisError('PROJECT_NOT_FOUND', 'The workflow project was not found.', 404);
    const plan = buildPlatformPlan(request.platform, project.workflow);
    return validateWorkflow(project.workflow, request.platform, plan.validationIssues);
  }
}
