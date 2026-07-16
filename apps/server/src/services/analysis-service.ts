import { aiWorkflowOutputSchema, compileAutomationArchitecture, inferWorkflowConnections, validateWorkflowGraph, workflowAnalysisResultSchema, type WorkflowAnalysisResult } from '@awm/shared';
import { parseJsonWithRepair } from '../ai/repair/json-repair.js';
import { repairWorkflowCandidate } from '../ai/repair/workflow-repair.js';
import type { AnalysisProvider } from '../ai/providers/analysis-provider.js';
import { LocalAnalysisProvider } from '../ai/providers/local-provider.js';
import { AnalysisPipeline } from '../analysis/analysis-pipeline.js';
import type { ProjectRepository } from '../repositories/project-repository.js';
import type { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { PlannerShadowService } from '../planner/planner-shadow-service.js';
import { UnifiedPlannerRuntime, type PlannerRuntime } from '../planner/planner-runtime-service.js';

export class AnalysisError extends Error {
  public constructor(public readonly code: string, message: string, public readonly statusCode = 422) { super(message); this.name = 'AnalysisError'; }
}

export class AnalysisService {
  public constructor(private readonly repository: ProjectRepository, private readonly provider: AnalysisProvider, private readonly pipeline = new AnalysisPipeline(), private readonly scopeIntelligence: ScopeIntelligenceService | null = null, private readonly plannerRuntime: PlannerRuntime | null = new UnifiedPlannerRuntime('shadow', new PlannerShadowService(), null)) {}
  public getProviderStatus() { return this.provider.getStatus(); }
  public async analyze(projectId: string): Promise<WorkflowAnalysisResult> {
    return this.pipeline.run(() => this.analyzeCurrent(projectId));
  }
  private async analyzeCurrent(projectId: string): Promise<WorkflowAnalysisResult> {
    const project = this.repository.findById(projectId);
    if (!project) throw new AnalysisError('PROJECT_NOT_FOUND', 'The workflow project was not found.', 404);
    if (!project.originalScope.trim()) throw new AnalysisError('SCOPE_REQUIRED', 'Add and save a Scope of Work before analysis.', 400);
    const input = { scope: project.originalScope, projectName: project.name, platform: project.platform };
    const detectedProcess = this.scopeIntelligence?.analyze(project.originalScope);
    let raw: unknown; let providerUsed: 'local' | 'openai' | 'ollama' = this.provider.name; let fallbackReason = '';
    const useFreeFallback = async (reason: string) => {
      if (providerUsed === 'local') throw new AnalysisError('LOCAL_ANALYSIS_FAILED', reason, 422);
      providerUsed = 'local'; fallbackReason = reason;
      raw = await new LocalAnalysisProvider().analyze(input);
    };
    try { raw = await this.provider.analyze(input); }
    catch (error) { await useFreeFallback(error instanceof Error ? error.message : 'The configured AI provider failed.'); }
    if (typeof raw === 'string') {
      try { raw = parseJsonWithRepair(raw); }
      catch (error) { await useFreeFallback(error instanceof Error ? error.message : 'AI output could not be repaired.'); }
    }
    let parsed = aiWorkflowOutputSchema.safeParse(raw);
    if (!parsed.success) {
      const repaired = repairWorkflowCandidate(raw);
      parsed = aiWorkflowOutputSchema.safeParse(repaired.value);
      if (parsed.success && repaired.repairs.length) parsed.data.warnings.push(`AI output repaired before validation: ${repaired.repairs.join(', ')}.`);
    }
    if (!parsed.success) {
      const reason = `AI output failed schema validation: ${parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`;
      await useFreeFallback(reason); parsed = aiWorkflowOutputSchema.safeParse(raw);
    }
    if (!parsed.success) throw new AnalysisError('AI_SCHEMA_VALIDATION_FAILED', 'The free local fallback could not produce a valid workflow.');
    parsed.data = compileAutomationArchitecture(inferWorkflowConnections(parsed.data));
    let validation = validateWorkflowGraph(parsed.data);
    if (!validation.valid && providerUsed !== 'local') {
      await useFreeFallback(`Generated workflow graph was invalid: ${validation.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message).join('; ')}`);
      const fallback = aiWorkflowOutputSchema.parse(raw); parsed = { success: true, data: compileAutomationArchitecture(inferWorkflowConnections(fallback)) }; validation = validateWorkflowGraph(parsed.data);
    }
    if (!validation.valid) throw new AnalysisError('AI_GRAPH_VALIDATION_FAILED', `Generated workflow graph is invalid: ${validation.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message).join('; ')}`);
    if (fallbackReason) parsed.data.warnings.push(`Free deterministic fallback used because the configured AI result could not be accepted: ${fallbackReason}`);
    const plannerResult = detectedProcess && this.plannerRuntime ? await this.plannerRuntime.execute(this.provider, project.originalScope, project.platform, detectedProcess, parsed.data) : {};
    const plannerShadow = plannerResult.plannerShadow;
    this.repository.updateWorkflow(project.id, parsed.data);
    return workflowAnalysisResultSchema.parse({ workflow: parsed.data, graphValidation: { valid: true, errorCount: 0, warningCount: validation.issues.filter((issue) => issue.severity === 'warning').length }, provider: providerUsed, analyzedAt: new Date().toISOString(), ...(detectedProcess ? { detectedProcess } : {}), ...(plannerShadow ? { plannerShadow } : {}) });
  }
}
