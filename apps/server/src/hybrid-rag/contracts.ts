export type HybridRAGMode = "off" | "compare" | "guarded" | "enabled";

export interface KnowledgeSource {
  id: string;
}

export interface KnowledgeDocument {
  id: string;
  sourceId: string;
  content: string;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  content: string;
}

export interface RetrievalRequest {
  query: string;
}

export interface RetrievalResult {
  chunks: KnowledgeChunk[];
}

export interface HybridRAGHealth {
  initialized: boolean;
  ready: boolean;
  provider: string;
  mode: HybridRAGMode;
}
