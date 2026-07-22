import type {
  HybridRAGHealth,
  HybridRAGMode,
  RetrievalRequest,
  RetrievalResult,
} from "./contracts.js";

export interface HybridRAGProvider {
  readonly name: string;
  initialize(): Promise<boolean>;
  retrieve(request: RetrievalRequest): Promise<RetrievalResult>;
  health(): Promise<{ initialized: boolean; ready: boolean }>;
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
