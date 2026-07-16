import { zodToJsonSchema } from 'zod-to-json-schema';
import { aiWorkflowOutputSchema } from '@awm/shared';
import { buildWorkflowAnalysisPrompt, workflowAnalysisSystemPrompt } from '../prompts/workflow-analysis.js';
import { PlannerRuntimeError } from '../../planner/planner-runtime.js';
import type { AnalysisProvider, AnalysisProviderInput, GroundedPlannerRequest, GroundedPlannerResponse } from './analysis-provider.js';

export class OpenAIAnalysisProvider implements AnalysisProvider {
  public readonly name = 'openai' as const;
  public constructor(private readonly config: { apiKey: string; baseUrl: string; model: string }) {}
  public async analyze(input: AnalysisProviderInput): Promise<unknown> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/responses`, {
      method: 'POST', signal: AbortSignal.timeout(90_000),
      headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.config.model, instructions: workflowAnalysisSystemPrompt, input: buildWorkflowAnalysisPrompt(input), text: { format: { type: 'json_schema', name: 'workflow_analysis', strict: false, schema: zodToJsonSchema(aiWorkflowOutputSchema, { $refStrategy: 'none' }) } } })
    });
    if (!response.ok) throw new Error(`AI provider request failed with status ${response.status}.`);
    const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    const text = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
    if (!text) throw new Error('AI provider returned no workflow output.');
    return text;
  }
  public async planGrounded(request: GroundedPlannerRequest): Promise<unknown> {
    return (await this.planGroundedDetailed(request)).content;
  }
  public async planGroundedDetailed(request: GroundedPlannerRequest): Promise<GroundedPlannerResponse> {
    const started = performance.now();
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/responses`, { method: 'POST', ...(request.signal ? { signal: request.signal } : {}), headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: this.config.model, instructions: request.system, input: request.user, text: { format: { type: 'json_schema', name: 'grounded_workflow_plan', strict: false, schema: request.outputSchema } } }) });
    const timeToFirstByteMs = Number((performance.now() - started).toFixed(2));
    if (!response.ok) throw new Error(`Grounded planner request failed with status ${response.status}.`);
    const responseText = await response.text();
    if (responseText.length > Math.max((request.maximumOutputCharacters ?? 120_000) * 2, 10_000)) throw new PlannerRuntimeError('output_too_large', 'Grounded planner response exceeded its configured size limit.');
    let payload: { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    try { payload = JSON.parse(responseText) as typeof payload; }
    catch { throw new PlannerRuntimeError('invalid_json', 'OpenAI returned an invalid JSON response envelope.'); }
    const text = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
    if (!text) throw new Error('Grounded planner returned no plan.');
    if (text.length > (request.maximumOutputCharacters ?? 120_000)) throw new PlannerRuntimeError('output_too_large', 'Grounded planner output exceeded its configured size limit.');
    return { content: text, timeToFirstByteMs, outputCharacters: text.length };
  }
  public async getStatus() { return { provider: this.name, available: Boolean(this.config.apiKey), models: [this.config.model], message: this.config.apiKey ? 'OpenAI provider is configured.' : 'OpenAI API key is missing.' }; }
}
