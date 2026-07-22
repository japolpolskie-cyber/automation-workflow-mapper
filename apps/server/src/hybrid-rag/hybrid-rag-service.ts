import type {
  HybridRAGHealth,
  HybridRAGMode,
  RetrievalRequest,
  RetrievalResult,
  KnowledgePlatform,
  RetrievalStrategy,
} from "./contracts.js";

export interface HybridRAGProviderHealth {
  initialized: boolean;
  ready: boolean;
  indexedDocumentCount: number;
  indexedChunkCount: number;
  platformCounts: Record<KnowledgePlatform, number>;
  embeddingProvider: string | null;
  embeddingReady: boolean;
  vectorDimensions: number | null;
  indexedVectorCount: number;
  vectorIndexHealthy: boolean;
  lastIndexBuildStatus: "not-built" | "ready" | "failed";
  supportedRetrievalStrategies: RetrievalStrategy[];
}

export interface HybridRAGProvider {
  readonly name: string;
  initialize(): Promise<boolean>;
  retrieve(request: RetrievalRequest): Promise<RetrievalResult>;
  health(): Promise<HybridRAGProviderHealth>;
}

export interface HybridRAGService {
  initialize(): Promise<boolean>;
  retrieve(request: RetrievalRequest): Promise<RetrievalResult>;
  health(): Promise<HybridRAGHealth>;
}

export class DefaultHybridRAGService implements HybridRAGService {
  public constructor(
    private readonly mode: HybridRAGMode,
    private readonly provider: HybridRAGProvider,
  ) {}

  public initialize(): Promise<boolean> {
    return this.provider.initialize();
  }

  public retrieve(request: RetrievalRequest): Promise<RetrievalResult> {
    return this.provider.retrieve(request);
  }

  public async health(): Promise<HybridRAGHealth> {
    const providerHealth = await this.provider.health();
    return {
      ...providerHealth,
      provider: this.provider.name,
      mode: this.mode,
    };
  }
}
