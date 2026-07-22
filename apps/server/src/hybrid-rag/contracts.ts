export type HybridRAGMode = "off" | "compare" | "guarded" | "enabled";
export type KnowledgePlatform = "n8n" | "make" | "zapier";

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
}

export interface RetrievalResult {
  chunks: KnowledgeChunk[];
}

export interface HybridRAGHealth {
  initialized: boolean;
  ready: boolean;
  provider: string;
  mode: HybridRAGMode;
  indexedDocumentCount: number;
  indexedChunkCount: number;
  platformCounts: Record<KnowledgePlatform, number>;
}
