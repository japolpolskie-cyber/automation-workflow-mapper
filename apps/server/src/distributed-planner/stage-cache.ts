import { createHash } from 'node:crypto';
import type { PlannerArtifactProvenance } from '@awm/shared';

export interface StageCacheKeyParts {
  normalizedScopeHash: string;
  stageInstanceId: string;
  stageId: string;
  stageVersion: string;
  detectorVersion: string;
  catalogVersion: string;
  inputContractVersion: string;
  platform: string;
  upstreamOutputHashes: string[];
  modelIdentity: string | null;
  inputHash: string;
}

export interface StageCacheEntry { key: string; output: unknown; outputHash: string; provenance: PlannerArtifactProvenance; createdAt: string }
export interface StageCache { get(key: string): Promise<StageCacheEntry | null>; set(entry: StageCacheEntry): Promise<void>; invalidate(key?: string): Promise<void> }

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
};

export function contentHash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function buildStageCacheKey(parts: StageCacheKeyParts): string { return contentHash(parts); }

export class StageCacheCorruptionError extends Error {
  public constructor(message: string) { super(message); this.name = 'StageCacheCorruptionError'; }
}

export class InMemoryStageCache implements StageCache {
  private readonly entries = new Map<string, StageCacheEntry>();
  public async get(key: string): Promise<StageCacheEntry | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.key !== key || contentHash(entry.output) !== entry.outputHash) throw new StageCacheCorruptionError(`Distributed planner cache entry ${key} failed integrity validation.`);
    return structuredClone(entry);
  }
  public async set(entry: StageCacheEntry): Promise<void> { this.entries.set(entry.key, structuredClone(entry)); }
  public async invalidate(key?: string): Promise<void> { if (key) this.entries.delete(key); else this.entries.clear(); }
  public unsafeSet(entry: StageCacheEntry): void { this.entries.set(entry.key, entry); }
}
