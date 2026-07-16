import type { z } from 'zod';
import type { AnalysisProvider } from '../ai/providers/analysis-provider.js';
import { DistributedStageError, type ModelNeutralStageRunner, type StageRunnerContext } from './distributed-planner-orchestrator.js';
import type { P3StageMetrics, PlannerStageRunnerFactory } from './p3-ollama-stage-runner.js';
import { buildControlledOutputSchema } from './controlled-output-schema.js';

class ProviderStageRunner implements ModelNeutralStageRunner {
  public readonly runnerId: string;
  public readonly modelId: string | null;
  public readonly metrics: P3StageMetrics[] = [];

  public constructor(
    private readonly provider: AnalysisProvider,
    private readonly stageName: 'business-intent' | 'workflow-skeleton',
    private readonly outputSchema: z.ZodType,
    private readonly maximumOutputCharacters: number,
  ) {
    this.runnerId = `${provider.name}.${stageName}`;
    this.modelId = provider.name;
  }

  public async run(input: unknown, context: StageRunnerContext): Promise<unknown> {
    if (!this.provider.planGrounded) throw new DistributedStageError('provider-unavailable', `${this.provider.name} does not support staged planning.`, false);
    const system = this.stageName === 'business-intent'
      ? 'Interpret high-level business intent. Select only numeric symbols from the supplied deterministic symbol table. Never create identifiers, operations, workflow nodes, policies, or observability metrics. Return JSON only.'
      : 'Create a high-level canonical skeleton. Select only supplied numeric symbols and use array indexes for topology. Never create identifiers, operations, platform nodes, policies, or observability metrics. Return JSON only.';
    const corrective = context.attempt ? ' Correct invalid JSON, schema, symbol, or topology output without changing business meaning.' : '';
    const user = `Controlled stage input:\n${JSON.stringify(input)}\n${corrective}`;
    const started = performance.now();
    const controlledSchema = buildControlledOutputSchema(this.outputSchema, input);
    let value: unknown;
    try {
      value = this.provider.planGroundedDetailed
        ? (await this.provider.planGroundedDetailed({ system, user, outputSchema: controlledSchema, signal: context.signal, maximumOutputCharacters: this.maximumOutputCharacters })).content
        : await this.provider.planGrounded({ system, user, outputSchema: controlledSchema, signal: context.signal, maximumOutputCharacters: this.maximumOutputCharacters });
    } catch (error) {
      if (context.signal.aborted) throw error;
      throw new DistributedStageError('provider-connection-failure', error instanceof Error ? error.message : 'Planner provider failed.', false);
    }
    const outputCharacters = typeof value === 'string' ? value.length : JSON.stringify(value).length;
    this.metrics.push({ promptCharacters: system.length + user.length, outputCharacters, latencyMs: Number((performance.now() - started).toFixed(2)), attempt: context.attempt });
    if (outputCharacters > this.maximumOutputCharacters) throw new DistributedStageError('invalid-output', 'Stage output exceeded the configured output limit.', false);
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value) as unknown; }
    catch { throw new DistributedStageError('malformed-model-output', 'Stage output was not valid JSON.', true); }
  }
}

export class ProviderPlannerStageRunnerFactory implements PlannerStageRunnerFactory {
  public constructor(private readonly provider: AnalysisProvider) {}
  public create(stageName: 'business-intent' | 'workflow-skeleton', outputSchema: z.ZodType, maximumOutputCharacters: number) {
    return new ProviderStageRunner(this.provider, stageName, outputSchema, maximumOutputCharacters);
  }
}
