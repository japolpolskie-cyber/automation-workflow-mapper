import { aiWorkflowOutputSchema, compileAutomationArchitecture, inferWorkflowConnections, validateWorkflowGraph, workflowAnalysisResultSchema, type CanonicalWorkflow, type WorkflowAnalysisResult, type WorkflowConnection, type WorkflowNode } from '@awm/shared';
import { parseJsonWithRepair } from '../ai/repair/json-repair.js';
import { repairWorkflowCandidate } from '../ai/repair/workflow-repair.js';
import type { AnalysisProvider } from '../ai/providers/analysis-provider.js';
import { shouldPartitionWorkflowScope, LocalAnalysisProvider } from '../ai/providers/local-provider.js';
import { AnalysisPipeline } from '../analysis/analysis-pipeline.js';
import type { ProjectRepository } from '../repositories/project-repository.js';
import type { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { PlannerShadowService } from '../planner/planner-shadow-service.js';
import { UnifiedPlannerRuntime, type PlannerRuntime } from '../planner/planner-runtime-service.js';
import { countExplicitWorkflowSteps } from '../ai/prompts/workflow-analysis.js';

export class AnalysisError extends Error {
  public constructor(public readonly code: string, message: string, public readonly statusCode = 422) { super(message); this.name = 'AnalysisError'; }
}

export class AnalysisService {
  public constructor(private readonly repository: ProjectRepository, private readonly provider: AnalysisProvider, private readonly pipeline = new AnalysisPipeline(), private readonly scopeIntelligence: ScopeIntelligenceService | null = null, private readonly plannerRuntime: PlannerRuntime | null = new UnifiedPlannerRuntime('shadow', new PlannerShadowService(), null)) {}
  public getProviderStatus() { return this.provider.getStatus(); }
  public async analyze(projectId: string, workflowMode: 'auto' | 'single' = 'auto'): Promise<WorkflowAnalysisResult> {
    return this.pipeline.run(() => this.analyzeCurrent(projectId, workflowMode));
  }
  private async analyzeCurrent(projectId: string, workflowMode: 'auto' | 'single'): Promise<WorkflowAnalysisResult> {
    const project = this.repository.findById(projectId);
    if (!project) throw new AnalysisError('PROJECT_NOT_FOUND', 'The workflow project was not found.', 404);
    if (!project.originalScope.trim()) throw new AnalysisError('SCOPE_REQUIRED', 'Add and save a Scope of Work before analysis.', 400);
    const input = {
      scope: project.originalScope,
      projectName: project.name,
      platform: project.platform,
      ...(workflowMode === 'single' ? { workflowMode } : {}),
    };
    const detectedProcess = this.scopeIntelligence?.analyze(project.originalScope);
    let raw: unknown; let providerUsed: 'local' | 'openai' | 'ollama' = this.provider.name; let fallbackReason = '';
    const useFreeFallback = async (reason: string) => {
      if (providerUsed === 'local') throw new AnalysisError('LOCAL_ANALYSIS_FAILED', reason, 422);
      providerUsed = 'local'; fallbackReason = reason;
      raw = await new LocalAnalysisProvider().analyze(input);
    };
    if (this.provider.name === 'ollama' && shouldPartitionWorkflowScope(project.originalScope, workflowMode === 'single')) {
      await useFreeFallback('Large multi-workflow portfolio or multiple independent workflow triggers detected. Deterministic capability analysis was used to preserve separate execution boundaries.');
    } else {
      try { raw = await this.provider.analyze(input); }
      catch (error) { await useFreeFallback(error instanceof Error ? error.message : 'The configured AI provider failed.'); }
    }
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
    const explicitStepCount = countExplicitWorkflowSteps(project.originalScope);
    const representedSteps = parsed.data.nodes.filter((node) => !['start', 'end', 'note', 'group'].includes(node.category)).length;
    if (providerUsed !== 'local' && explicitStepCount >= 4 && representedSteps < explicitStepCount) {
      await useFreeFallback(`Generated workflow preserved only ${representedSteps} of ${explicitStepCount} explicit workflow steps.`);
      parsed = aiWorkflowOutputSchema.safeParse(raw);
      if (!parsed.success) throw new AnalysisError('AI_SCHEMA_VALIDATION_FAILED', 'The free local fallback could not preserve the explicit workflow sequence.');
    }
    let prepared = prepareWorkflowForPersistence(parsed.data, providerUsed === 'ollama');
    parsed.data = prepared.workflow;
    let validation = prepared.validation;

    if ((!validation.valid || prepared.boundaryError) && providerUsed !== 'local') {
      const reason = prepared.boundaryError ?? validation.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message).join('; ');
      await useFreeFallback(`Generated workflow graph was invalid: ${reason}`);
      const fallback = aiWorkflowOutputSchema.parse(raw);
      prepared = prepareWorkflowForPersistence(fallback, false);
      parsed = { success: true, data: prepared.workflow };
      validation = prepared.validation;
    }
    if (!validation.valid || prepared.boundaryError) {
      const reason = prepared.boundaryError ?? validation.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message).join('; ');
      throw new AnalysisError('AI_GRAPH_VALIDATION_FAILED', `Generated workflow graph is invalid: ${reason}`);
    }
    if (fallbackReason) parsed.data.warnings.push(`Free deterministic fallback used because the configured AI result could not be accepted: ${fallbackReason}`);
    const plannerResult = detectedProcess && this.plannerRuntime ? await this.plannerRuntime.execute(this.provider, project.originalScope, project.platform, detectedProcess, parsed.data) : {};
    const plannerShadow = plannerResult.plannerShadow;
    const v21Analysis = plannerResult.v21Analysis;
    this.repository.updateWorkflow(project.id, parsed.data);
    return workflowAnalysisResultSchema.parse({ workflow: parsed.data, graphValidation: { valid: true, errorCount: 0, warningCount: validation.issues.filter((issue) => issue.severity === 'warning').length }, provider: providerUsed, analyzedAt: new Date().toISOString(), ...(detectedProcess ? { detectedProcess } : {}), ...(plannerShadow ? { plannerShadow } : {}), ...(v21Analysis ? { v21Analysis } : {}) });
  }
}

function prepareWorkflowForPersistence(input: CanonicalWorkflow, requireSingleEntry: boolean) {
  let workflow = compileAutomationArchitecture(inferWorkflowConnections(input));
  let validation = validateWorkflowGraph(workflow);
  let entries = workflow.nodes.filter(isEntryNode);
  let boundaryError = workflow.nodes.length ? '' : 'The generated workflow contains no workflow steps.';

  const startNodes = workflow.nodes.filter(
    (node) => node.category === 'start'
  );

  const triggerNodes = workflow.nodes.filter(
    (node) => node.category === 'trigger'
  );

  if (startNodes.length === 1 && triggerNodes.length === 1) {
    const startNode = startNodes[0]!;
    const triggerNode = triggerNodes[0]!;

    const startToTrigger = workflow.connections.some(
      (connection) =>
        connection.sourceNodeId === startNode.id &&
        connection.targetNodeId === triggerNode.id
    );

    if (startToTrigger) {
      workflow = {
        ...workflow,
        nodes: workflow.nodes.filter(
          (node) => node.id !== startNode.id
        ),
        connections: workflow.connections.filter(
          (connection) =>
            connection.sourceNodeId !== startNode.id &&
            connection.targetNodeId !== startNode.id
        ),
        warnings: [
          ...workflow.warnings,
          'Removed redundant Start node because the workflow already contains an explicit trigger.',
        ],
        updatedAt: new Date().toISOString(),
      };

      validation = validateWorkflowGraph(workflow);
      entries = workflow.nodes.filter(isEntryNode);
    }
  }

  if (entries.length === 0) {
    const repaired = addCanonicalStart(workflow);
    if (repaired) {
      workflow = compileAutomationArchitecture(repaired);
      validation = validateWorkflowGraph(workflow);
      entries = workflow.nodes.filter(isEntryNode);
      boundaryError = '';
    }
  }
  if (requireSingleEntry && entries.length !== 1) {
    boundaryError = `Ollama must return exactly one trigger or start node; received ${entries.length}.`;
  }
  return { workflow, validation, boundaryError };
}

function addCanonicalStart(workflow: CanonicalWorkflow): CanonicalWorkflow | null {
  const incoming = new Set(workflow.connections.map((connection) => connection.targetNodeId));
  const roots = workflow.nodes.filter((node) => !incoming.has(node.id) && !['note', 'group'].includes(node.category));
  if (!roots.length) return null;
  const start: WorkflowNode = {
    id: crypto.randomUUID(), category: 'start', name: 'Workflow Start',
    description: 'Platform-neutral entry point for a procedural workflow without an explicit trigger.',
    service: null, operation: 'Start workflow', purpose: 'Begin the documented procedure without inventing an application event.',
    expectedResult: 'The workflow begins with the supplied procedural inputs.', icon: 'generic-start',
    estimatedExecution: 'Immediate', inputs: [], outputs: [], credentials: [], configuration: {},
    status: 'incomplete', configurationCompleteness: 20, conditions: [], decisionRule: null, notes: 'Deterministically added because the otherwise valid model graph omitted its entry point.',
    bestPractices: ['Replace with an evidenced trigger only when the business event is known.'], potentialErrors: [],
    alternativeImplementations: [], performanceNotes: [], securityNotes: [], riskLevel: 'low',
  };
  const connections: WorkflowConnection[] = roots.map((root) => ({
    id: crypto.randomUUID(), sourceNodeId: start.id, targetNodeId: root.id,
    sourcePort: 'output', targetPort: 'input', label: '', branchLabel: null,
    condition: null, routeType: 'success', style: 'default', mappings: [],
  }));
  return {
    ...workflow,
    nodes: [start, ...workflow.nodes],
    connections: [...connections, ...workflow.connections],
    warnings: [...workflow.warnings, 'A platform-neutral Start node was added because the model omitted the workflow entry point.'],
    updatedAt: new Date().toISOString(),
  };
}

function isEntryNode(node: WorkflowNode) {
  return node.category === 'trigger' || node.category === 'start';
}
