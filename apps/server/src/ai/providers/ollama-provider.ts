import { aiWorkflowOutputSchema } from '@awm/shared';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { buildWorkflowAnalysisPrompt, workflowAnalysisSystemPrompt } from '../prompts/workflow-analysis.js';
import { PlannerRuntimeError } from '../../planner/planner-runtime.js';
import type { AnalysisProvider, AnalysisProviderInput, AnalysisProviderStatus, GroundedPlannerRequest, GroundedPlannerResponse } from './analysis-provider.js';

interface OllamaTagsResponse { models?: Array<{ name?: string; model?: string }> }
interface OllamaChatResponse { message?: { content?: string } }

export class OllamaAnalysisProvider implements AnalysisProvider {
  public readonly name = 'ollama' as const;
  private analysisQueue: Promise<void> = Promise.resolve();
  public constructor(private readonly config: { baseUrl: string; models: string[] }) {}

  public async getStatus(): Promise<AnalysisProviderStatus> {
    try {
      const installed = await this.getInstalledModels();
      const usable = this.config.models.filter((model) => installed.has(model));
      return { provider: this.name, available: usable.length > 0, models: usable, message: usable.length ? `Ready with ${usable.length} configured local model${usable.length === 1 ? '' : 's'}.` : `Ollama is running, but none of these models are installed: ${this.config.models.join(', ')}.` };
    } catch {
      return { provider: this.name, available: false, models: [], message: 'Ollama is not reachable. Start Ollama and install at least one configured model.' };
    }
  }

  public analyze(input: AnalysisProviderInput): Promise<unknown> {
    const task = this.analysisQueue.then(() => this.analyzeNext(input), () => this.analyzeNext(input));
    this.analysisQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  public planGrounded(request: GroundedPlannerRequest): Promise<unknown> {
    return this.planGroundedDetailed(request).then((response) => response.content);
  }

  public planGroundedDetailed(request: GroundedPlannerRequest): Promise<GroundedPlannerResponse> {
    const task = this.analysisQueue.then(() => this.planNext(request), () => this.planNext(request));
    this.analysisQueue = task.then(() => undefined, () => undefined); return task;
  }

  private async planNext(request: GroundedPlannerRequest): Promise<GroundedPlannerResponse> {
    const installed = await this.getInstalledModels(); const candidates = this.config.models.filter((model) => installed.has(model));
    if (!candidates.length) throw new Error('No configured Ollama model is available for grounded planning.');
    const schema = request.outputSchema;
    const started = performance.now();
    const response = await fetch(`${this.baseUrl()}/api/chat`, { method: 'POST', ...(request.signal ? { signal: request.signal } : {}), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: candidates[0], stream: false, think: false, format: schema, keep_alive: '10m', options: { temperature: 0, num_ctx: 16_384, num_predict: 8_192 }, messages: [{ role: 'system', content: request.system }, { role: 'user', content: `${request.user}\n\nReturn JSON matching this schema exactly:\n${JSON.stringify(schema)}` }] }) });
    const timeToFirstByteMs = Number((performance.now() - started).toFixed(2));
    if (!response.ok) throw new Error(`Grounded planner request returned ${response.status}.`);
    const responseText = await response.text();
    const responseLimit = Math.max((request.maximumOutputCharacters ?? 120_000) * 2, 10_000);
    if (responseText.length > responseLimit) throw new PlannerRuntimeError('output_too_large', `Grounded planner response exceeded the ${responseLimit}-character response limit.`);
    let payload: OllamaChatResponse;
    try { payload = JSON.parse(responseText) as OllamaChatResponse; }
    catch { throw new PlannerRuntimeError('invalid_json', 'Ollama returned an invalid JSON response envelope.'); }
    const content = payload.message?.content;
    if (!content) throw new Error('Grounded planner returned no structured content.');
    if (content.length > (request.maximumOutputCharacters ?? 120_000)) throw new PlannerRuntimeError('output_too_large', `Grounded planner output exceeded ${request.maximumOutputCharacters ?? 120_000} characters.`);
    return { content, timeToFirstByteMs, outputCharacters: content.length };
  }

  private async analyzeNext(input: AnalysisProviderInput): Promise<unknown> {
    let installed: Set<string>;
    try { installed = await this.getInstalledModels(); }
    catch { throw new Error(`Ollama is not reachable at ${this.config.baseUrl}. Start Ollama and try again.`); }
    const candidates = this.config.models.filter((model) => installed.has(model));
    if (!candidates.length) throw new Error(`None of the configured Ollama models are installed. Install one of: ${this.config.models.join(', ')}.`);
    const failures: string[] = [];
    for (const model of candidates) {
      try { return await this.requestModel(model, input); }
      catch (error) { failures.push(`${model}: ${error instanceof Error ? error.message : 'failed'}`); }
    }
    throw new Error(`All configured local models failed. ${failures.join(' | ')}`);
  }

  private async getInstalledModels(): Promise<Set<string>> {
    const response = await fetch(`${this.baseUrl()}/api/tags`, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`Ollama status request failed with ${response.status}.`);
    const payload = await response.json() as OllamaTagsResponse;
    return new Set((payload.models ?? []).flatMap((item) => [item.name, item.model]).filter((value): value is string => Boolean(value)));
  }

  private async requestModel(model: string, input: AnalysisProviderInput): Promise<string> {
    const schema = zodToJsonSchema(aiWorkflowOutputSchema, { $refStrategy: 'none' });
    const response = await fetch(`${this.baseUrl()}/api/chat`, {
      method: 'POST', signal: AbortSignal.timeout(600_000), headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: false, think: false, format: 'json', keep_alive: '10m', options: { temperature: 0, num_ctx: 16_384, num_predict: 8_192 }, messages: [{ role: 'system', content: workflowAnalysisSystemPrompt }, { role: 'user', content: `${buildWorkflowAnalysisPrompt(input)}\n\nReturn an object matching this JSON schema exactly:\n${JSON.stringify(schema)}` }] })
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`request returned ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    const payload = await response.json() as OllamaChatResponse;
    if (!payload.message?.content) throw new Error('model returned no structured content');
    return payload.message.content;
  }

  private baseUrl() { return this.config.baseUrl.replace(/\/$/, ''); }
}
