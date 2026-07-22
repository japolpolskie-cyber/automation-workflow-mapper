import {
  plannerRetrievalContextSchema,
  type PlannerRetrievalContext,
  type Platform,
} from "@awm/shared";
import type {
  RetrievalResult,
  RetrievalStrategy,
} from "./contracts.js";

export interface PlannerRetrievalLimits {
  maximumResults: number;
  maximumChunkCharacters: number;
  maximumContextCharacters: number;
}

export const DEFAULT_PLANNER_RETRIEVAL_LIMITS: PlannerRetrievalLimits = {
  maximumResults: 6,
  maximumChunkCharacters: 800,
  maximumContextCharacters: 4_000,
};

export function buildPlannerRetrievalContext(
  result: RetrievalResult,
  platform: Platform,
  provider: string,
  strategy: RetrievalStrategy,
  limits: PlannerRetrievalLimits = DEFAULT_PLANNER_RETRIEVAL_LIMITS,
): PlannerRetrievalContext | null {
  if (!Array.isArray(result.chunks) || !Array.isArray(result.scores)) {
    throw new Error("Retrieval result is invalid.");
  }
  if (result.chunks.some((chunk) => chunk.platform !== platform)) {
    throw new Error("Retrieval result violated platform isolation.");
  }
  const scores = new Map(result.scores.map((score) => [score.chunkId, score.combinedScore]));
  let remaining = limits.maximumContextCharacters;
  const items = result.chunks.slice(0, limits.maximumResults).flatMap((chunk) => {
    const score = scores.get(chunk.id);
    if (!Number.isFinite(score) || remaining <= 0) return [];
    const content = chunk.content.slice(0, Math.min(limits.maximumChunkCharacters, remaining)).trim();
    if (!content) return [];
    remaining -= content.length;
    return [{
      chunkId: chunk.id,
      documentId: chunk.documentId,
      platform: chunk.platform,
      title: chunk.title,
      content,
      score: score!,
      sourceId: chunk.source.id,
      sourceVersion: chunk.source.version,
    }];
  });
  if (!items.length) return null;
  return plannerRetrievalContextSchema.parse({ strategy, provider, items });
}
