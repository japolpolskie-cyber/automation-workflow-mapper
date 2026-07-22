import type { RetrievalRequest, RetrievalResult } from "./contracts.js";
import type {
  HybridRAGProvider,
  HybridRAGProviderHealth,
} from "./hybrid-rag-service.js";
import { KnowledgeIndex } from "./knowledge-index.js";
import { loadKnowledgePacks } from "./knowledge-pack-loader.js";

export class KeywordHybridRAGProvider implements HybridRAGProvider {
  public readonly name = "keyword";

  public constructor(private readonly index = new KnowledgeIndex()) {}

  public async initialize(): Promise<boolean> {
    this.index.build(loadKnowledgePacks());
    return true;
  }

  public async retrieve(request: RetrievalRequest): Promise<RetrievalResult> {
    return this.index.retrieve(request);
  }

  public async health(): Promise<HybridRAGProviderHealth> {
    const status = this.index.health();
    return { ...status, ready: status.initialized };
  }
}
