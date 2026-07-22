import { describe, expect, it } from "vitest";
import { DefaultHybridRAGService } from "./hybrid-rag-service.js";
import { NoOpHybridRAGProvider } from "./no-op-hybrid-rag-provider.js";

describe("Hybrid RAG foundation", () => {
  it("initializes the no-op provider successfully", async () => {
    const provider = new NoOpHybridRAGProvider();

    await expect(provider.initialize()).resolves.toBe(true);
    await expect(provider.health()).resolves.toEqual({
      initialized: true,
      ready: true,
      indexedDocumentCount: 0,
      indexedChunkCount: 0,
      platformCounts: { n8n: 0, make: 0, zapier: 0 },
    });
  });

  it("exposes the intentionally small health contract", async () => {
    const service = new DefaultHybridRAGService(
      "off",
      new NoOpHybridRAGProvider(),
    );

    await expect(service.initialize()).resolves.toBe(true);
    await expect(service.health()).resolves.toEqual({
      initialized: true,
      ready: true,
      provider: "noop",
      mode: "off",
      indexedDocumentCount: 0,
      indexedChunkCount: 0,
      platformCounts: { n8n: 0, make: 0, zapier: 0 },
    });
  });
});
