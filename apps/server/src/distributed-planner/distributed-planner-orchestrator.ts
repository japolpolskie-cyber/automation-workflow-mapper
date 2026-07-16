import { randomUUID } from 'node:crypto';
import { distributedPlannerContractVersion, distributedPlannerRunReportSchema, type DistributedPlannerFailureCategory, type DistributedPlannerRunReport, type DistributedPlannerStageId, type DistributedPlannerStageState, type Platform, type StructuredWorkflowPlan } from '@awm/shared';
import type { z } from 'zod';
import { assertStageTransition } from './stage-lifecycle.js';
import { buildStageCacheKey, contentHash, InMemoryStageCache, type StageCache } from './stage-cache.js';

export interface StageRunnerContext { signal: AbortSignal; attempt: number; stageInstanceId: string; runId: string; previousValidationIssues: string[] }
export interface ModelNeutralStageRunner { readonly runnerId: string; readonly modelId: string | null; run(input: unknown, context: StageRunnerContext): Promise<unknown> }
export interface StageRetryPolicy { maximumRetries: number; retryableCategories: DistributedPlannerFailureCategory[] }
export interface StageCachePolicy { enabled: boolean; bypass?: boolean }
export interface DistributedStageDefinition {
  instanceId: string;
  stageId: DistributedPlannerStageId;
  version: string;
  contractVersion: typeof distributedPlannerContractVersion;
  inputContractVersion: string;
  dependencies: string[];
  dependencyVersions?: Record<string, string>;
  enabled: boolean;
  timeoutMs: number;
  retryPolicy: StageRetryPolicy;
  cachePolicy: StageCachePolicy;
  parallelGroup?: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  buildInput(context: DistributedPlannerRunContext, upstream: ReadonlyMap<string, unknown>): unknown;
  runner: ModelNeutralStageRunner;
  blockingClarificationIds?(output: unknown): string[];
  finalGraph?(output: unknown): StructuredWorkflowPlan | null;
}
export interface DistributedPlannerRunContext {
  rawScope: string;
  normalizedScopeHash: string;
  platform: Platform;
  detectorVersion: string;
  catalogVersion: string;
  data?: Readonly<Record<string, unknown>>;
}
export interface DistributedPlannerExecutionPolicy { totalTimeoutMs: number; maximumConcurrency: number; cacheEnabled: boolean }
export interface DistributedPlannerRunOptions { signal?: AbortSignal; cacheBypass?: boolean }

export class DistributedStageError extends Error {
  public constructor(public readonly category: DistributedPlannerFailureCategory, message: string, public readonly retryable = false, public readonly details: Record<string, unknown> = {}) { super(message); this.name = 'DistributedStageError'; }
}

type MutableStageReport = DistributedPlannerRunReport['stages'][number];
const successful = (state: DistributedPlannerStageState) => state === 'succeeded' || state === 'cache-hit';
const freezeDeep = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) freezeDeep(item); }
  return value;
};

export class DistributedPlannerOrchestrator {
  private readonly definitions = new Map<string, DistributedStageDefinition>();
  public constructor(private readonly policy: DistributedPlannerExecutionPolicy, private readonly cache: StageCache = new InMemoryStageCache(), private readonly now: () => Date = () => new Date()) {
    if (policy.maximumConcurrency < 1) throw new Error('Distributed planner concurrency must be at least one.');
  }
  public register(definition: DistributedStageDefinition): void {
    if (this.definitions.has(definition.instanceId)) throw new Error(`Distributed planner stage ${definition.instanceId} is already registered.`);
    if (definition.contractVersion !== distributedPlannerContractVersion) throw new Error(`Stage ${definition.instanceId} uses incompatible contract version ${definition.contractVersion}.`);
    this.definitions.set(definition.instanceId, definition);
  }

  public async run(context: DistributedPlannerRunContext, options: DistributedPlannerRunOptions = {}): Promise<DistributedPlannerRunReport> {
    const ordered = this.resolveOrder();
    const runId = randomUUID();
    const started = this.now();
    const startedPerformance = performance.now();
    const totalController = new AbortController();
    let totalExpired = false;
    const totalTimer = setTimeout(() => { totalExpired = true; totalController.abort(); }, this.policy.totalTimeoutMs);
    const cancel = () => totalController.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    const outputs = new Map<string, unknown>();
    const outputHashes = new Map<string, string>();
    const reports = new Map<string, MutableStageReport>();
    let finalGraph: StructuredWorkflowPlan | null = null;
    const transition = (report: MutableStageReport, to: DistributedPlannerStageState, reason: string) => {
      assertStageTransition(report.status, to);
      const from = report.status; report.status = to; report.transitions.push({ from, to, at: this.now().toISOString(), reason });
    };
    for (const definition of ordered) reports.set(definition.instanceId, { stageInstanceId: definition.instanceId, stageId: definition.stageId, stageVersion: definition.version, status: 'pending', dependencies: [...definition.dependencies], attempts: 0, cache: 'disabled', latencyMs: 0, transitions: [], artifactId: null, provenance: null, failure: null });

    try {
      for (const definition of ordered) {
        const report = reports.get(definition.instanceId)!;
        if (totalController.signal.aborted) {
          transition(report, 'cancelled', totalExpired ? 'Total pipeline deadline expired.' : 'Pipeline cancellation requested.');
          report.failure = this.failure(definition, report, totalExpired ? 'timeout' : 'cancellation', totalExpired ? 'Total pipeline deadline expired.' : 'Pipeline cancelled.', false);
          continue;
        }
        if (!definition.enabled) { transition(report, 'skipped', 'Stage disabled.'); continue; }
        const failedDependency = definition.dependencies.find((id) => !successful(reports.get(id)!.status));
        if (failedDependency) {
          transition(report, 'skipped', `Dependency ${failedDependency} did not succeed.`);
          report.failure = this.failure(definition, report, 'dependency-failure', `Dependency ${failedDependency} did not succeed.`, false, true);
          continue;
        }
        transition(report, 'ready', 'Dependencies satisfied.');
        const upstream = new Map(definition.dependencies.map((id) => [id, outputs.get(id)]));
        let input: unknown;
        try { input = definition.inputSchema.parse(definition.buildInput(context, upstream)); }
        catch (error) {
          transition(report, 'running', 'Input validation started.'); transition(report, 'failed', 'Stage input is invalid.');
          report.failure = this.failure(definition, report, 'invalid-input', error instanceof Error ? error.message : 'Invalid stage input.', false);
          continue;
        }
        const immutableInput = freezeDeep(structuredClone(input));
        const inputHash = contentHash(immutableInput);
        const cacheKey = buildStageCacheKey({ normalizedScopeHash: context.normalizedScopeHash, stageInstanceId: definition.instanceId, stageId: definition.stageId, stageVersion: definition.version, detectorVersion: context.detectorVersion, catalogVersion: context.catalogVersion, inputContractVersion: definition.inputContractVersion, platform: context.platform, upstreamOutputHashes: definition.dependencies.map((id) => outputHashes.get(id)!), modelIdentity: definition.runner.modelId, inputHash });
        if (this.policy.cacheEnabled && definition.cachePolicy.enabled && !definition.cachePolicy.bypass && !options.cacheBypass) {
          try {
            const cached = await this.cache.get(cacheKey);
            if (cached) {
              const parsed = definition.outputSchema.parse(cached.output); outputs.set(definition.instanceId, parsed); outputHashes.set(definition.instanceId, cached.outputHash);
              report.cache = 'hit'; report.artifactId = cached.outputHash; report.provenance = cached.provenance; transition(report, 'cache-hit', 'Validated content-addressed cache hit.');
              continue;
            }
            report.cache = 'miss';
          } catch (error) {
            report.cache = 'corrupt'; transition(report, 'running', 'Cache integrity validation started.'); transition(report, 'failed', 'Cache entry is corrupt.');
            report.failure = this.failure(definition, report, 'cache-corruption', error instanceof Error ? error.message : 'Cache corruption.', false);
            continue;
          }
        } else report.cache = options.cacheBypass || definition.cachePolicy.bypass ? 'bypass' : 'disabled';

        const stageStarted = performance.now();
        let output: unknown;
        let completed = false;
        let previousValidationIssues: string[] = [];
        for (let attempt = 0; attempt <= definition.retryPolicy.maximumRetries; attempt += 1) {
          report.attempts = attempt + 1;
          if (report.status === 'ready') transition(report, 'running', `Stage attempt ${attempt + 1} started.`);
          try {
            output = await this.runBounded(definition, immutableInput, runId, attempt, totalController.signal, previousValidationIssues);
            if (contentHash(immutableInput) !== inputHash) throw new DistributedStageError('orchestration-error', 'Stage mutated its immutable input.');
            output = definition.outputSchema.parse(output);
            const blockers = definition.blockingClarificationIds?.(output) ?? [];
            if (blockers.length) throw new DistributedStageError('blocking-clarification', `Stage is blocked by clarifications: ${blockers.join(', ')}.`, false, { clarificationIds: blockers });
            completed = true; break;
          } catch (error) {
            const normalized = this.normalizeFailure(error, totalController.signal, totalExpired);
            previousValidationIssues = Array.isArray(normalized.details.issues)
              ? normalized.details.issues.map((item) => typeof item === 'object' && item !== null && 'code' in item && 'message' in item ? `${String(item.code)}: ${String(item.message)}` : String(item))
              : [normalized.message];
            const eligible = normalized.retryable && definition.retryPolicy.retryableCategories.includes(normalized.category) && attempt < definition.retryPolicy.maximumRetries;
            if (eligible) continue;
            const state: DistributedPlannerStageState = normalized.category === 'timeout' ? 'timed-out' : normalized.category === 'cancellation' ? 'cancelled' : normalized.category === 'blocking-clarification' ? 'blocked-by-clarification' : 'failed';
            transition(report, state, normalized.message);
            report.failure = this.failure(definition, report, normalized.category, normalized.message, normalized.retryable, false, normalized.details);
            break;
          }
        }
        report.latencyMs = Number((performance.now() - stageStarted).toFixed(2));
        if (!completed) continue;
        const outputHash = contentHash(output); outputs.set(definition.instanceId, output); outputHashes.set(definition.instanceId, outputHash);
        report.artifactId = outputHash;
        report.provenance = { runId, stageInstanceId: definition.instanceId, stageId: definition.stageId, stageVersion: definition.version, contractVersion: distributedPlannerContractVersion, runnerId: definition.runner.runnerId, modelId: definition.runner.modelId, scopeHash: context.normalizedScopeHash, catalogVersion: context.catalogVersion, detectorVersion: context.detectorVersion, inputContractVersion: definition.inputContractVersion, platform: context.platform, dependencyArtifactIds: definition.dependencies.map((id) => reports.get(id)!.artifactId!), createdAt: this.now().toISOString() };
        transition(report, 'succeeded', 'Output passed its strict stage contract.');
        if (this.policy.cacheEnabled && definition.cachePolicy.enabled && !options.cacheBypass) await this.cache.set({ key: cacheKey, output, outputHash, provenance: report.provenance, createdAt: this.now().toISOString() });
        finalGraph = definition.finalGraph?.(output) ?? finalGraph;
      }
    } finally {
      clearTimeout(totalTimer);
      options.signal?.removeEventListener('abort', cancel);
    }
    const stages = ordered.map((item) => reports.get(item.instanceId)!);
    for (const report of stages) if (report.failure) report.failure.downstreamSkipped = stages.some((candidate) => candidate.status === 'skipped' && candidate.dependencies.includes(report.stageInstanceId));
    const blocked = stages.some((item) => item.status === 'blocked-by-clarification');
    const cancelled = stages.some((item) => item.status === 'cancelled');
    const failed = stages.some((item) => ['failed', 'timed-out'].includes(item.status));
    const status = blocked ? 'blocked' : cancelled ? 'cancelled' : failed ? 'failed' : 'completed';
    return distributedPlannerRunReportSchema.parse({ contractVersion: distributedPlannerContractVersion, runId, status, startedAt: started.toISOString(), completedAt: this.now().toISOString(), durationMs: Number((performance.now() - startedPerformance).toFixed(2)), stageSequence: ordered.map((item) => item.instanceId), stages, finalGraph, persisted: false });
  }

  private resolveOrder(): DistributedStageDefinition[] {
    for (const definition of this.definitions.values()) for (const dependency of definition.dependencies) {
      const target = this.definitions.get(dependency); if (!target) throw new Error(`Stage ${definition.instanceId} has missing dependency ${dependency}.`);
      const expected = definition.dependencyVersions?.[dependency]; if (expected && expected !== target.version) throw new Error(`Stage ${definition.instanceId} requires ${dependency}@${expected}, but ${target.version} is registered.`);
    }
    const visiting = new Set<string>(); const visited = new Set<string>(); const ordered: DistributedStageDefinition[] = [];
    const visit = (id: string) => { if (visiting.has(id)) throw new Error(`Circular distributed planner dependency detected at ${id}.`); if (visited.has(id)) return; visiting.add(id); const definition = this.definitions.get(id)!; definition.dependencies.forEach(visit); visiting.delete(id); visited.add(id); ordered.push(definition); };
    [...this.definitions.keys()].sort().forEach(visit); return ordered;
  }
  private async runBounded(definition: DistributedStageDefinition, input: unknown, runId: string, attempt: number, totalSignal: AbortSignal, previousValidationIssues: string[]): Promise<unknown> {
    const controller = new AbortController(); let expired = false;
    const timeout = setTimeout(() => { expired = true; controller.abort(); }, definition.timeoutMs);
    const cancel = () => controller.abort(); totalSignal.addEventListener('abort', cancel, { once: true });
    const abort = new Promise<never>((_resolve, reject) => controller.signal.addEventListener('abort', () => reject(new DistributedStageError(totalSignal.aborted ? 'cancellation' : 'timeout', totalSignal.aborted ? 'Pipeline cancelled.' : `Stage exceeded ${definition.timeoutMs}ms timeout.`, false, { expired })), { once: true }));
    if (totalSignal.aborted) controller.abort();
    const running = definition.runner.run(input, { signal: controller.signal, attempt, stageInstanceId: definition.instanceId, runId, previousValidationIssues }); running.catch(() => undefined);
    try { return await Promise.race([running, abort]); } finally { clearTimeout(timeout); totalSignal.removeEventListener('abort', cancel); }
  }
  private normalizeFailure(error: unknown, signal: AbortSignal, totalExpired: boolean): DistributedStageError {
    if (signal.aborted) return new DistributedStageError(totalExpired ? 'timeout' : 'cancellation', totalExpired ? 'Total pipeline deadline expired.' : 'Pipeline cancelled.');
    if (error instanceof DistributedStageError) return error;
    if (error && typeof error === 'object' && 'issues' in error) return new DistributedStageError('invalid-output', 'Stage output failed its strict contract.', true, { cause: String(error) });
    return new DistributedStageError('unknown', error instanceof Error ? error.message : 'Unknown stage failure.');
  }
  private failure(definition: DistributedStageDefinition, report: MutableStageReport, category: DistributedPlannerFailureCategory, cause: string, retryable: boolean, downstreamSkipped = false, diagnosticDetails: Record<string, unknown> = {}) {
    return { category, stageInstanceId: definition.instanceId, stageId: definition.stageId, stageVersion: definition.version, retryable, retryCount: Math.max(0, report.attempts - 1), cause, userExplanation: category === 'blocking-clarification' ? 'Planning needs clarification before this stage can continue.' : 'This distributed planning stage did not complete safely.', diagnosticDetails, downstreamSkipped };
  }
}
