import type {
  HybridRAGProviderHealth,
} from "./hybrid-rag-service.js";
import type {
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgePlatform,
  RetrievalRequest,
  RetrievalResult,
} from "./contracts.js";
import { chunkKnowledgeDocument } from "./knowledge-chunker.js";
import {
  normalizeKnowledgeDocument,
  normalizeSearchText,
} from "./knowledge-normalizer.js";

const validPlatforms = new Set<KnowledgePlatform>(["n8n", "make", "zapier"]);
const emptyPlatformCounts = (): Record<KnowledgePlatform, number> => ({
  n8n: 0,
  make: 0,
  zapier: 0,
});

function scoreChunk(chunk: KnowledgeChunk, query: string, terms: string[]): number {
  const title = normalizeSearchText(chunk.title);
  const content = normalizeSearchText(chunk.content);
  const category = normalizeSearchText(chunk.category);
  const tags = chunk.tags.map(normalizeSearchText);
  let score = 0;
  if (title === query) score += 1_000;
  else if (title.includes(query)) score += 500;
  if (tags.includes(query) || category === query) score += 400;
  if (content.includes(query)) score += 50;
  for (const term of terms) {
    if (tags.includes(term) || category === term) score += 100;
    if (title.includes(term)) score += 25;
    if (content.includes(term)) score += 5;
  }
  return score;
}

export class KnowledgeIndex {
  private documents: KnowledgeDocument[] = [];
  private chunks: KnowledgeChunk[] = [];
  private initialized = false;

  public build(documents: readonly KnowledgeDocument[]): void {
    this.documents = documents
      .map(normalizeKnowledgeDocument)
      .sort((left, right) => left.id.localeCompare(right.id));
    this.chunks = this.documents.flatMap((document) => chunkKnowledgeDocument(document));
    this.initialized = true;
  }

  public refresh(documents: readonly KnowledgeDocument[]): void {
    this.build(documents);
  }

  public getChunks(): readonly KnowledgeChunk[] {
    return this.chunks;
  }

  public retrieve(request: RetrievalRequest): RetrievalResult {
    const query = normalizeSearchText(request.query ?? "");
    if (!query || !validPlatforms.has(request.platform)) return { chunks: [] };
    const limit = Math.max(0, Math.floor(request.limit ?? 10));
    if (limit === 0) return { chunks: [] };
    const terms = [...new Set(query.split(" ").filter(Boolean))];
    const chunks = this.chunks
      .filter((chunk) => chunk.platform === request.platform)
      .map((chunk) => ({ chunk, score: scoreChunk(chunk, query, terms) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id))
      .slice(0, limit)
      .map(({ chunk }) => chunk);
    return { chunks };
  }

  public health(): Omit<HybridRAGProviderHealth, "ready"> {
    const platformCounts = emptyPlatformCounts();
    for (const document of this.documents) platformCounts[document.platform] += 1;
    return {
      initialized: this.initialized,
      indexedDocumentCount: this.documents.length,
      indexedChunkCount: this.chunks.length,
      platformCounts,
    };
  }
}
