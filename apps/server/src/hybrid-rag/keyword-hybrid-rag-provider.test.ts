import { describe, expect, it } from "vitest";
import { DefaultHybridRAGService } from "./hybrid-rag-service.js";
import { KeywordHybridRAGProvider } from "./keyword-hybrid-rag-provider.js";

describe("keyword Hybrid RAG service integration", () => {
  it("retrieves isolated keyword results directly while mode remains off", async () => {
    const service = new DefaultHybridRAGService(
      "off",
      new KeywordHybridRAGProvider(),
    );
    await service.initialize();

    const result = await service.retrieve({
      query: "array aggregator",
      platform: "make",
      limit: 2,
    });
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.every((chunk) => chunk.platform === "make")).toBe(true);
    await expect(service.health()).resolves.toMatchObject({
      initialized: true,
      ready: true,
      provider: "keyword",
      mode: "off",
    });
  });
});
