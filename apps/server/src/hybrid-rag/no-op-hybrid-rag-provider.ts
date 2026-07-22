import type { RetrievalResult } from "./contracts.js";
import type { HybridRAGProvider } from "./hybrid-rag-service.js";

export class NoOpHybridRAGProvider implements HybridRAGProvider {
  public readonly name = "noop";
  private initialized = false;

  public async initialize(): Promise<boolean> {
    this.initialized = true;
    return true;
  }

  public async retrieve(): Promise<RetrievalResult> {
    return { chunks: [] };
  }

  public async health(): Promise<{ initialized: boolean; ready: boolean }> {
    return { initialized: this.initialized, ready: this.initialized };
  }
}
