import { createHash } from 'node:crypto';
import { KNOWLEDGE_CATALOG_VERSION } from '@awm/knowledge';
import type { PlannerContext, PlannerFailureCategory, Platform } from '@awm/shared';
import { K3_RULE_VERSION } from '../analysis/scope-intelligence.js';

export const K4_PROMPT_VERSION = '4.2.0' as const;

export interface PlannerRuntimeOptions {
  timeoutMs: number;
  maximumOutputCharacters: number;
  maximumRetries: number;
  contextBudget: number;
}

export const defaultPlannerRuntimeOptions: PlannerRuntimeOptions = {
  timeoutMs: 180_000,
  maximumOutputCharacters: 120_000,
  maximumRetries: 1,
  contextBudget: 24_000,
};

export class PlannerRuntimeError extends Error {
  public constructor(public readonly category: PlannerFailureCategory, message: string) {
    super(message);
    this.name = 'PlannerRuntimeError';
  }
}

export function classifyPlannerFailure(error: unknown): PlannerFailureCategory {
  if (error instanceof PlannerRuntimeError) return error.category;
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('cancel')) return 'cancellation';
  if (message.includes('timeout') || message.includes('aborted')) return 'timeout';
  if (message.includes('ollama') && (message.includes('not reachable') || message.includes('unavailable') || message.includes('no configured'))) return 'ollama_unavailable';
  if (message.includes('fetch failed') || message.includes('connection')) return 'connection_failure';
  if (message.includes('context') && (message.includes('large') || message.includes('budget'))) return 'context_too_large';
  if (message.includes('output') && message.includes('large')) return 'output_too_large';
  if (message.includes('json')) return 'invalid_json';
  if (message.includes('schema') || message.includes('parse')) return 'schema_mismatch';
  if (message.includes('unsupported') || message.includes('invented')) return 'unsupported_reference';
  if (message.includes('incomplete') || message.includes('unreachable')) return 'incomplete_graph';
  if (message.includes('graph is invalid') || message.includes('validation')) return 'validation_failure';
  return 'unknown_provider_error';
}

export class PlannerContextCache {
  private readonly values = new Map<string, PlannerContext>();
  public key(scope: string, platform: Platform): string {
    const scopeHash = createHash('sha256').update(scope).digest('hex');
    return [scopeHash, KNOWLEDGE_CATALOG_VERSION, K3_RULE_VERSION, K4_PROMPT_VERSION, platform].join(':');
  }
  public get(key: string): PlannerContext | undefined { return this.values.get(key); }
  public set(key: string, value: PlannerContext): void { this.values.set(key, value); }
  public clear(): void { this.values.clear(); }
}
