import type { RetrievalResult } from "./contracts.js";
import type { HybridRAGProvider, HybridRAGProviderHealth } from "./hybrid-rag-service.js";

export class NoOpHybridRAGProvider implements HybridRAGProvider {
  public readonly name = "noop";
  private initialized = false;

  public async initialize(): Promise<boolean> {
    this.initialized = true;
    return true;
  }

  public async retrieve(): Promise<RetrievalResult> {
    return { chunks: [], scores: [] };
  }

  public async health(): Promise<HybridRAGProviderHealth> {
    return {
      initialized: this.initialized,
      ready: this.initialized,
      indexedDocumentCount: 0,
      indexedChunkCount: 0,
      platformCounts: { n8n: 0, make: 0, zapier: 0 },
      embeddingProvider: null,
      embeddingReady: false,
      vectorDimensions: null,
      indexedVectorCount: 0,
      vectorIndexHealthy: false,
      lastIndexBuildStatus: "not-built",
      supportedRetrievalStrategies: ["keyword"],
    };
  }
}
