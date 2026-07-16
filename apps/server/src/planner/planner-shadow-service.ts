import { plannerShadowComparisonSchema, structuredWorkflowPlanSchema, type CanonicalWorkflow, type DetectedProcessSummary, type PlannerShadowComparison, type Platform, type StructuredWorkflowPlan } from '@awm/shared';
import { parseJsonWithRepair } from '../ai/repair/json-repair.js';
import type { AnalysisProvider, GroundedPlannerResponse } from '../ai/providers/analysis-provider.js';
import { PlannerContextBuilder } from './planner-context-builder.js';
import { PlannerPromptBuilder } from './planner-prompt-builder.js';
import { validatePlannerGraph } from './planner-graph-validator.js';
import { classifyPlannerFailure, defaultPlannerRuntimeOptions, PlannerContextCache, PlannerRuntimeError, type PlannerRuntimeOptions } from './planner-runtime.js';
import { compactPlannerPlanSchema, expandCompactPlannerPlan } from './planner-wire-format.js';

export class PlannerShadowService {
  private readonly options: PlannerRuntimeOptions;
  public constructor(
    private readonly contextBuilder = new PlannerContextBuilder(),
    private readonly promptBuilder = new PlannerPromptBuilder(),
    options: Partial<PlannerRuntimeOptions> = {},
    private readonly cache = new PlannerContextCache(),
  ) { this.options = { ...defaultPlannerRuntimeOptions, ...options }; }

  public async compare(provider: AnalysisProvider, objective: string, platform: Platform, analysis: DetectedProcessSummary, current: CanonicalWorkflow, signal?: AbortSignal): Promise<PlannerShadowComparison> {
    const started = performance.now();
    const cacheKey = this.cache.key(objective, platform);
    let context = this.cache.get(cacheKey);
    const cacheHit = Boolean(context);
    context ??= this.contextBuilder.build(objective, platform, analysis);
    if (!cacheHit) this.cache.set(cacheKey, context);
    const prompt = this.promptBuilder.build(context);
    const base = {
      oldNodeCount: current.nodes.length,
      promptCharacters: prompt.characterCount,
      retrievedKnowledgeCharacters: prompt.sectionCharacterCounts['Retrieved Knowledge'] ?? 0,
      rawScopeCharacters: objective.length,
      estimatedPromptTokens: Math.ceil(prompt.characterCount / 4),
      promptSectionCharacters: prompt.sectionCharacterCounts,
    };
    let generatedOutputCharacters = 0;
    let timeToFirstByteMs: number | null = null;
    let parseLatencyMs = 0;
    let validationLatencyMs = 0;
    let retryCount = 0;
    let stage: 'context' | 'generation' | 'parse' | 'schema' | 'reference' | 'validation' | 'completed' = 'context';
    try {
      if (!provider.planGrounded) throw new Error(`${provider.name} does not support grounded planning.`);
      if (prompt.characterCount > this.options.contextBudget) throw new PlannerRuntimeError('context_too_large', `Grounded planner context uses ${prompt.characterCount} characters, above the ${this.options.contextBudget}-character budget.`);
      let plan: StructuredWorkflowPlan | null = null;
      let lastError: unknown;
      for (let attempt = 0; attempt <= this.options.maximumRetries; attempt += 1) {
        retryCount = attempt;
        try {
          stage = 'generation';
          const providerValue = await this.generateBounded(provider, { system: prompt.system, user: prompt.user, outputSchema: prompt.providerOutputSchema, maximumOutputCharacters: this.options.maximumOutputCharacters }, signal);
          const response = this.unwrapProviderResponse(providerValue);
          generatedOutputCharacters = response.outputCharacters;
          timeToFirstByteMs = response.timeToFirstByteMs;
          stage = 'parse';
          const parseStarted = performance.now();
          let raw = response.content;
          if (typeof raw === 'string') raw = parseJsonWithRepair(raw);
          parseLatencyMs += performance.now() - parseStarted;
          stage = 'schema';
          const existing = structuredWorkflowPlanSchema.safeParse(raw);
          plan = existing.success ? existing.data : structuredWorkflowPlanSchema.parse(expandCompactPlannerPlan(compactPlannerPlanSchema.parse(raw)));
          break;
        } catch (error) {
          lastError = signal?.aborted ? new PlannerRuntimeError('cancellation', 'Grounded planning was cancelled.') : error;
          const category = classifyPlannerFailure(lastError);
          const retryable = ['invalid_json', 'schema_mismatch', 'incomplete_graph', 'validation_failure'].includes(category);
          if (attempt >= this.options.maximumRetries || !retryable) throw lastError;
        }
      }
      if (!plan) throw lastError ?? new Error('Grounded planner returned no complete graph.');
      stage = 'reference';
      const allowed = new Set(context.supportedOperations);
      const invalidApplications = plan.nodes.filter((node) => node.applicationRef && !context.allowedApplications.includes(node.applicationRef)).map((node) => node.applicationRef!);
      const invalidFunctions = plan.nodes.filter((node) => !context.allowedCanonicalFunctions.includes(node.canonicalFunctionId)).map((node) => node.canonicalFunctionId);
      const unsupportedOperations = plan.nodes.filter((node) => node.operationRef && !allowed.has(node.operationRef)).map((node) => node.operationRef!);
      const requiredClarifications = new Set(context.clarifications.map((item) => item.id)); const declaredClarifications = new Set([...plan.blockedByClarificationIds, ...plan.nodes.flatMap((node) => node.blockedByClarificationIds)]); const preservedClarifications = [...declaredClarifications].filter((id) => requiredClarifications.has(id));
      if (unsupportedOperations.length) throw new Error(`Grounded plan invented unsupported operations: ${unsupportedOperations.join(', ')}.`);
      if (invalidApplications.length) throw new Error(`Grounded plan invented unsupported applications: ${invalidApplications.join(', ')}.`);
      if (invalidFunctions.length) throw new Error(`Grounded plan invented unsupported canonical functions: ${invalidFunctions.join(', ')}.`);
      const missingClarifications = [...requiredClarifications].filter((id) => !declaredClarifications.has(id)); if (missingClarifications.length) throw new Error(`Grounded plan omitted required clarifications: ${missingClarifications.join(', ')}.`);
      stage = 'validation';
      const validationStarted = performance.now();
      const graphIssues = validatePlannerGraph(plan, context);
      validationLatencyMs = performance.now() - validationStarted;
      if (graphIssues.length) throw new Error(`Grounded plan graph is invalid: ${graphIssues.slice(0, 5).map((item) => `${item.code}: ${item.message}`).join('; ')}`);
      const groundedFunctions = new Set<string>(plan.nodes.map((node) => node.canonicalFunctionId)); const oldFunctions = new Set<string>(current.nodes.map((node) => node.category === 'condition' ? 'binary-condition' : node.category));
      stage = 'completed';
      return plannerShadowComparisonSchema.parse({ status: 'completed', groundedPlan: plan, differences: { improvedDetections: [...groundedFunctions].filter((item) => !oldFunctions.has(item)), lostDetections: [...oldFunctions].filter((item) => !groundedFunctions.has(item)), unsupportedOperations, preservedClarifications }, metrics: { ...base, groundedStepCount: plan.nodes.length, groundedEdgeCount: plan.edges.length, planningLatencyMs: Number((performance.now() - started).toFixed(2)), generatedOutputCharacters, timeToFirstByteMs, parseLatencyMs: Number(parseLatencyMs.toFixed(2)), validationLatencyMs: Number(validationLatencyMs.toFixed(2)), retryCount }, diagnostic: { failureCategory: null, stage, cacheHit, compacted: true, cancelled: false }, error: null });
    } catch (error) {
      const failureCategory = classifyPlannerFailure(error);
      return plannerShadowComparisonSchema.parse({ status: 'failed', groundedPlan: null, differences: { improvedDetections: [], lostDetections: [], unsupportedOperations: [], preservedClarifications: [] }, metrics: { ...base, groundedStepCount: 0, groundedEdgeCount: 0, planningLatencyMs: Number((performance.now() - started).toFixed(2)), generatedOutputCharacters, timeToFirstByteMs, parseLatencyMs: Number(parseLatencyMs.toFixed(2)), validationLatencyMs: Number(validationLatencyMs.toFixed(2)), retryCount }, diagnostic: { failureCategory, stage, cacheHit, compacted: true, cancelled: failureCategory === 'cancellation' }, error: error instanceof Error ? error.message : 'Grounded planning failed.' });
    }
  }

  private unwrapProviderResponse(value: unknown): GroundedPlannerResponse {
    if (typeof value === 'object' && value !== null && 'content' in value && 'outputCharacters' in value) return value as GroundedPlannerResponse;
    const outputCharacters = typeof value === 'string' ? value.length : JSON.stringify(value).length;
    if (outputCharacters > this.options.maximumOutputCharacters) throw new PlannerRuntimeError('output_too_large', `Grounded planner output exceeded ${this.options.maximumOutputCharacters} characters.`);
    return { content: value, outputCharacters, timeToFirstByteMs: null };
  }

  private async generateBounded(provider: AnalysisProvider, request: Omit<Parameters<NonNullable<AnalysisProvider['planGrounded']>>[0], 'signal'>, externalSignal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, this.options.timeoutMs);
    const cancel = () => controller.abort();
    externalSignal?.addEventListener('abort', cancel, { once: true });
    const aborted = new Promise<never>((_resolve, reject) => controller.signal.addEventListener('abort', () => reject(new PlannerRuntimeError(
      externalSignal?.aborted && !timedOut ? 'cancellation' : 'timeout',
      externalSignal?.aborted && !timedOut ? 'Grounded planning was cancelled.' : `Grounded planning exceeded the ${this.options.timeoutMs}ms timeout.`,
    )), { once: true }));
    const providerCall = provider.planGroundedDetailed
      ? provider.planGroundedDetailed({ ...request, signal: controller.signal })
      : provider.planGrounded!({ ...request, signal: controller.signal });
    providerCall.catch(() => undefined);
    try { return await Promise.race([providerCall, aborted]); }
    finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', cancel);
    }
  }
}
