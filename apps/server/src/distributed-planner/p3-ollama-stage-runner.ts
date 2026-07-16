import type { z } from 'zod';
import type { ModelNeutralStageRunner, StageRunnerContext } from './distributed-planner-orchestrator.js';
import { DistributedStageError } from './distributed-planner-orchestrator.js';
import { buildControlledOutputSchema } from './controlled-output-schema.js';

export interface P3StageMetrics { promptCharacters: number; outputCharacters: number; latencyMs: number; attempt: number }
export interface PlannerStageRunnerFactory {
  create(stageName: 'business-intent' | 'workflow-skeleton', outputSchema: z.ZodType, maximumOutputCharacters: number): ModelNeutralStageRunner & { metrics?: P3StageMetrics[] };
}

export class OllamaPlannerStageRunnerFactory implements PlannerStageRunnerFactory {
  public constructor(private readonly config: { baseUrl: string; model: string }) {}
  public create(stageName: 'business-intent' | 'workflow-skeleton', outputSchema: z.ZodType, maximumOutputCharacters: number) {
    return new P3OllamaStageRunner({ ...this.config, maximumOutputCharacters }, stageName, outputSchema);
  }
}

export class P3OllamaStageRunner implements ModelNeutralStageRunner {
  public readonly runnerId: string;
  public readonly modelId: string;
  public readonly metrics: P3StageMetrics[] = [];
  public constructor(
    private readonly config: { baseUrl: string; model: string; maximumOutputCharacters: number },
    private readonly stageName: 'business-intent' | 'workflow-skeleton',
    private readonly outputSchema: z.ZodType,
  ) { this.runnerId = `ollama.${stageName}`; this.modelId = config.model; }

  public async run(input: unknown, context: StageRunnerContext): Promise<unknown> {
    const schema = buildControlledOutputSchema(this.outputSchema, input);
    const system = this.stageName === 'business-intent'
      ? 'Interpret only high-level business intent. Select only numeric symbols from the supplied deterministic symbol table. Never create identifiers. Do not select operations, create workflow nodes or edges, invent missing policy, or output observability metrics. Preserve every supplied clarification. Return JSON only.'
      : 'Create only a high-level canonical workflow skeleton. Select only numeric symbols from the supplied deterministic symbol table and use array indexes for topology. Never create identifiers. Do not select application operations, map fields, create platform nodes, invent capabilities, or resolve missing policy. Preserve every supplied clarification. Return JSON only.';
    const corrective = context.attempt > 0
      ? `\nThis is the single bounded corrective retry. Correct exactly these deterministic validation issues without changing business meaning:\n${context.previousValidationIssues.join('\n')}`
      : '';
    const user = `Typed stage input:\n${JSON.stringify(input)}${corrective}`;
    const schemaText = JSON.stringify(schema); const promptCharacters = system.length + user.length + schemaText.length;
    const started = performance.now();
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST', signal: context.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.config.model, stream: false, think: false, format: schema, keep_alive: '10m', options: { temperature: 0, num_ctx: 8_192, num_predict: 4_096 }, messages: [{ role: 'system', content: system }, { role: 'user', content: `${user}\n\nReturn JSON matching this schema:\n${schemaText}` }] }),
      });
    } catch (error) {
      throw new DistributedStageError('provider-connection-failure', error instanceof Error ? error.message : 'Ollama connection failed.', false);
    }
    if (!response.ok) throw new DistributedStageError(response.status === 404 ? 'provider-unavailable' : 'provider-connection-failure', `Ollama returned status ${response.status}.`, false);
    const envelopeText = await response.text();
    if (envelopeText.length > this.config.maximumOutputCharacters * 2) throw new DistributedStageError('invalid-output', 'Ollama response envelope exceeded the configured output limit.', false);
    let envelope: { message?: { content?: string } };
    try { envelope = JSON.parse(envelopeText) as typeof envelope; } catch { throw new DistributedStageError('malformed-model-output', 'Ollama returned an invalid response envelope.', true); }
    const content = envelope.message?.content;
    if (!content) throw new DistributedStageError('malformed-model-output', 'Ollama returned no stage output.', true);
    if (content.length > this.config.maximumOutputCharacters) throw new DistributedStageError('invalid-output', 'Stage output exceeded the configured output limit.', false);
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw new DistributedStageError('malformed-model-output', 'Stage output was not valid JSON.', true); }
    this.metrics.push({ promptCharacters, outputCharacters: content.length, latencyMs: Number((performance.now() - started).toFixed(2)), attempt: context.attempt });
    return parsed;
  }
}
