import { describe, expect, it } from "vitest";
import { DefaultHybridRAGService } from "./hybrid-rag-service.js";
import { HybridRetrievalProvider } from "./hybrid-retrieval-provider.js";

describe("hybrid retrieval service", () => {
  it("selects keyword, vector, and hybrid strategies while mode is off", async () => {
    const service = new DefaultHybridRAGService("off", new HybridRetrievalProvider());
    await service.initialize();
    for (const strategy of ["keyword", "vector", "hybrid"] as const) {
      const result = await service.retrieve({
        query: "array aggregator",
        platform: "make",
        strategy,
        limit: 3,
      });
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.every((item) => item.platform === "make")).toBe(true);
      expect(result.scores).toHaveLength(result.chunks.length);
    }
    await expect(service.health()).resolves.toMatchObject({
      mode: "off",
      provider: "keyword-vector",
      embeddingProvider: "local-hash@1.0",
      embeddingReady: true,
      vectorDimensions: 64,
      vectorIndexHealthy: true,
      lastIndexBuildStatus: "ready",
      supportedRetrievalStrategies: ["keyword", "vector", "hybrid"],
    });
  });

  it("returns safe empty vector results for empty queries", async () => {
    const service = new DefaultHybridRAGService("off", new HybridRetrievalProvider());
    await service.initialize();
    await expect(service.retrieve({ query: "", platform: "zapier", strategy: "vector" })).resolves.toEqual({ chunks: [], scores: [] });
  });
});
