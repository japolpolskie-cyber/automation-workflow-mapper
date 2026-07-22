import type { EmbeddingProvider } from "./embedding-contracts.js";
import type { RetrievalRequest, RetrievalResult } from "./contracts.js";
import type {
  HybridRAGProvider,
  HybridRAGProviderHealth,
} from "./hybrid-rag-service.js";
import { fuseRetrievalResults } from "./hybrid-fusion.js";
import { KnowledgeIndex } from "./knowledge-index.js";
import { loadKnowledgePacks } from "./knowledge-pack-loader.js";
import { LocalHashEmbeddingProvider } from "./local-hash-embedding-provider.js";
import { VectorIndex } from "./vector-index.js";

export class HybridRetrievalProvider implements HybridRAGProvider {
  public readonly name = "keyword-vector";
  private lastIndexBuildStatus: "not-built" | "ready" | "failed" = "not-built";

  public constructor(
    private readonly keywordIndex = new KnowledgeIndex(),
    private readonly embeddingProvider: EmbeddingProvider = new LocalHashEmbeddingProvider(),
    private readonly vectorIndex = new VectorIndex(),
  ) {}

  public async initialize(): Promise<boolean> {
    try {
      await this.embeddingProvider.initialize();
      this.keywordIndex.build(loadKnowledgePacks());
      const chunks = this.keywordIndex.getChunks();
      const embeddings = await this.embeddingProvider.embed({
        texts: chunks.map((chunk) =>
          [chunk.title, chunk.category, ...chunk.tags, chunk.content].join(" "),
        ),
      });
      this.vectorIndex.replace(
        chunks,
        embeddings.vectors,
        embeddings.dimensions,
        embeddings.provider,
      );
      this.lastIndexBuildStatus = "ready";
      return true;
    } catch (error) {
      this.lastIndexBuildStatus = "failed";
      throw error;
    }
  }

  public async retrieve(request: RetrievalRequest): Promise<RetrievalResult> {
    const strategy = request.strategy ?? "hybrid";
    if (strategy === "keyword") return this.keywordIndex.retrieve(request);
    const embedding = await this.embeddingProvider.embed({ texts: [request.query] });
    const vector = this.vectorIndex.query({
      vector: embedding.vectors[0] ?? [],
      platform: request.platform,
      ...(request.limit === undefined ? {} : { limit: request.limit }),
    });
    if (strategy === "vector") return vector;
    const keyword = this.keywordIndex.retrieve(request);
    return fuseRetrievalResults(
      keyword,
      vector,
      request.platform,
      request.limit ?? 10,
    );
  }

  public async health(): Promise<HybridRAGProviderHealth> {
    const keyword = this.keywordIndex.health();
    const embedding = await this.embeddingProvider.health();
    const vector = this.vectorIndex.health();
    return {
      ...keyword,
      ready:
        keyword.initialized &&
        embedding.ready &&
        vector.healthy &&
        this.lastIndexBuildStatus === "ready",
      embeddingProvider: `${embedding.provider.name}@${embedding.provider.version}`,
      embeddingReady: embedding.ready,
      vectorDimensions: vector.dimensions,
      indexedVectorCount: vector.indexedVectorCount,
      vectorIndexHealthy: vector.healthy,
      lastIndexBuildStatus: this.lastIndexBuildStatus,
      supportedRetrievalStrategies: ["keyword", "vector", "hybrid"],
    };
  }
}
