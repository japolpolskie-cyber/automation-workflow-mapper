import type { EmbeddingProviderMetadata } from "./embedding-contracts.js";
import type {
  KnowledgeChunk,
  KnowledgePlatform,
  RetrievalResult,
} from "./contracts.js";

export interface VectorIndexEntry {
  chunk: KnowledgeChunk;
  vector: number[];
  embedding: EmbeddingProviderMetadata;
}

export interface VectorQuery {
  vector: number[];
  platform: KnowledgePlatform;
  limit?: number;
  minimumSimilarity?: number;
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

export class VectorIndex {
  private entries: VectorIndexEntry[] = [];
  private dimensions: number | null = null;

  public replace(
    chunks: readonly KnowledgeChunk[],
    vectors: readonly number[][],
    dimensions: number,
    embedding: EmbeddingProviderMetadata,
  ): void {
    if (chunks.length !== vectors.length) {
      throw new Error("Vector count must match chunk count.");
    }
    if (!Number.isInteger(dimensions) || dimensions < 1) {
      throw new Error("Vector dimensions must be a positive integer.");
    }
    if (vectors.some((vector) => vector.length !== dimensions)) {
      throw new Error("Indexed vector dimensions are inconsistent.");
    }
    this.entries = chunks.map((chunk, index) => ({
      chunk,
      vector: [...(vectors[index] ?? [])],
      embedding: { ...embedding },
    }));
    this.dimensions = dimensions;
  }

  public query(request: VectorQuery): RetrievalResult {
    if (this.dimensions === null || this.entries.length === 0) {
      return { chunks: [], scores: [] };
    }
    if (request.vector.length !== this.dimensions) {
      throw new Error(
        `Query vector dimensions ${request.vector.length} do not match index dimensions ${this.dimensions}.`,
      );
    }
    const limit = Math.max(0, Math.floor(request.limit ?? 10));
    const threshold = request.minimumSimilarity ?? 0.1;
    const ranked = this.entries
      .filter((entry) => entry.chunk.platform === request.platform)
      .map((entry) => ({
        entry,
        score: cosineSimilarity(request.vector, entry.vector),
      }))
      .filter(({ score }) => score >= threshold)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.entry.chunk.id.localeCompare(right.entry.chunk.id),
      )
      .slice(0, limit);
    return {
      chunks: ranked.map(({ entry }) => entry.chunk),
      scores: ranked.map(({ entry, score }) => ({
        chunkId: entry.chunk.id,
        combinedScore: score,
        keywordScore: 0,
        vectorScore: score,
      })),
    };
  }

  public health(): {
    healthy: boolean;
    dimensions: number | null;
    indexedVectorCount: number;
  } {
    return {
      healthy: this.dimensions !== null,
      dimensions: this.dimensions,
      indexedVectorCount: this.entries.length,
    };
  }
}
