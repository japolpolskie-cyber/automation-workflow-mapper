export type HybridRAGMode = "off" | "compare" | "guarded" | "enabled";
export type KnowledgePlatform = "n8n" | "make" | "zapier";
export type RetrievalStrategy = "keyword" | "vector" | "hybrid";

export interface KnowledgeSource {
  id: string;
  version: string;
}

export interface KnowledgeDocument {
  id: string;
  platform: KnowledgePlatform;
  title: string;
  content: string;
  category: string;
  tags: string[];
  source: KnowledgeSource;
  version: string;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  platform: KnowledgePlatform;
  title: string;
  content: string;
  category: string;
  tags: string[];
  source: KnowledgeSource;
  version: string;
}

export interface RetrievalRequest {
  query: string;
  platform: KnowledgePlatform;
  limit?: number;
  strategy?: RetrievalStrategy;
}

export interface RetrievalScoreBreakdown {
  chunkId: string;
  combinedScore: number;
  keywordScore: number;
  vectorScore: number;
}

export interface RetrievalResult {
  chunks: KnowledgeChunk[];
  scores: RetrievalScoreBreakdown[];
}

export interface HybridRAGHealth {
  initialized: boolean;
  ready: boolean;
  provider: string;
  mode: HybridRAGMode;
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
