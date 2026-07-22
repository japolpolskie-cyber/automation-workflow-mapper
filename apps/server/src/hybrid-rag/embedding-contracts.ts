export interface EmbeddingProviderMetadata {
  name: string;
  version: string;
}

export interface EmbeddingRequest {
  texts: string[];
}

export interface EmbeddingResult {
  vectors: number[][];
  dimensions: number;
  provider: EmbeddingProviderMetadata;
}

export interface EmbeddingHealth {
  initialized: boolean;
  ready: boolean;
  dimensions: number;
  provider: EmbeddingProviderMetadata;
}

export interface EmbeddingProvider {
  initialize(): Promise<boolean>;
  embed(request: EmbeddingRequest): Promise<EmbeddingResult>;
  health(): Promise<EmbeddingHealth>;
}
