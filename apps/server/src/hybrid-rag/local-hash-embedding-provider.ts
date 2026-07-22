import type {
  EmbeddingHealth,
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResult,
} from "./embedding-contracts.js";
import { normalizeSearchText } from "./knowledge-normalizer.js";

export const LOCAL_HASH_DIMENSIONS = 64;
const metadata = { name: "local-hash", version: "1.0" } as const;

function hashToken(token: string): number {
  let hash = 2_166_136_261;
  for (const character of token) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function embedText(text: string, dimensions: number): number[] {
  const vector = Array<number>(dimensions).fill(0);
  for (const token of normalizeSearchText(text).split(" ").filter(Boolean)) {
    const hash = hashToken(token);
    const index = hash % dimensions;
    vector[index] = (vector[index] ?? 0) + ((hash & 1) === 0 ? 1 : -1);
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}

export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  private initialized = false;

  public constructor(private readonly dimensions = LOCAL_HASH_DIMENSIONS) {
    if (!Number.isInteger(dimensions) || dimensions < 1) {
      throw new Error("Embedding dimensions must be a positive integer.");
    }
  }

  public async initialize(): Promise<boolean> {
    this.initialized = true;
    return true;
  }

  public async embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    if (!this.initialized) throw new Error("Embedding provider is not initialized.");
    return {
      vectors: request.texts.map((text) => embedText(text, this.dimensions)),
      dimensions: this.dimensions,
      provider: metadata,
    };
  }

  public async health(): Promise<EmbeddingHealth> {
    return {
      initialized: this.initialized,
      ready: this.initialized,
      dimensions: this.dimensions,
      provider: metadata,
    };
  }
}
