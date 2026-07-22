import { describe, expect, it } from "vitest";
import type { KnowledgeChunk, KnowledgePlatform } from "./contracts.js";
import { VectorIndex } from "./vector-index.js";

const chunk = (id: string, platform: KnowledgePlatform): KnowledgeChunk => ({
  id,
  documentId: `document-${id}`,
  platform,
  title: id,
  content: id,
  category: "action",
  tags: [],
  source: { id: "test", version: "1" },
  version: "1",
});
const metadata = { name: "test-embedding", version: "1" };

describe("vector index", () => {
  it("ranks cosine similarity, applies thresholds and top-k, and breaks ties stably", () => {
    const index = new VectorIndex();
    index.replace(
      [chunk("n8n.b", "n8n"), chunk("n8n.a", "n8n"), chunk("n8n.low", "n8n")],
      [[1, 0], [1, 0], [0, 1]],
      2,
      metadata,
    );
    const result = index.query({
      vector: [1, 0],
      platform: "n8n",
      limit: 2,
      minimumSimilarity: 0.5,
    });
    expect(result.chunks.map((item) => item.id)).toEqual(["n8n.a", "n8n.b"]);
  });

  it("replaces the index and strictly filters platforms", () => {
    const index = new VectorIndex();
    index.replace(
      [chunk("n8n.item", "n8n"), chunk("make.item", "make")],
      [[1, 0], [1, 0]],
      2,
      metadata,
    );
    expect(index.query({ vector: [1, 0], platform: "make" }).chunks.map((item) => item.platform)).toEqual(["make"]);
    index.replace([chunk("zapier.only", "zapier")], [[0, 1]], 2, metadata);
    expect(index.health().indexedVectorCount).toBe(1);
    expect(index.query({ vector: [1, 0], platform: "make" })).toEqual({ chunks: [], scores: [] });
  });

  it("handles empty indexes and rejects invalid dimensions", () => {
    const index = new VectorIndex();
    expect(index.query({ vector: [1], platform: "n8n" })).toEqual({ chunks: [], scores: [] });
    expect(() => index.replace([chunk("n8n.item", "n8n")], [[1]], 2, metadata)).toThrow(/dimensions/);
    index.replace([chunk("n8n.item", "n8n")], [[1, 0]], 2, metadata);
    expect(() => index.query({ vector: [1], platform: "n8n" })).toThrow(/dimensions/);
  });
});
