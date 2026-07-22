import { describe, expect, it } from "vitest";
import type { KnowledgeDocument } from "./contracts.js";
import { KnowledgeIndex } from "./knowledge-index.js";
import { loadKnowledgePacks } from "./knowledge-pack-loader.js";

const item = (
  id: string,
  title: string,
  content: string,
  tags: string[] = [],
): KnowledgeDocument => ({
  id: `n8n.${id}`,
  platform: "n8n",
  title,
  content,
  category: "action",
  tags,
  source: { id: "test", version: "1" },
  version: "1",
});

describe("Hybrid RAG knowledge index", () => {
  it("builds and replaces deterministic document, chunk, and platform counts", () => {
    const index = new KnowledgeIndex();
    index.build(loadKnowledgePacks());
    const built = index.health();
    expect(built.indexedDocumentCount).toBeGreaterThan(0);
    expect(built.indexedChunkCount).toBeGreaterThanOrEqual(built.indexedDocumentCount);
    expect(Object.values(built.platformCounts).every((count) => count > 0)).toBe(true);

    index.refresh([item("only", "Only", "Only content")]);
    expect(index.health()).toMatchObject({
      indexedDocumentCount: 1,
      indexedChunkCount: 1,
      platformCounts: { n8n: 1, make: 0, zapier: 0 },
    });
  });

  it("prefers exact phrases, respects top-k, and orders ties by stable ID", () => {
    const index = new KnowledgeIndex();
    index.build([
      item("z-content", "Other", "array aggregator"),
      item("exact", "Array Aggregator", "Combines results"),
      item("b-tag", "Second", "Something", ["array aggregator"]),
      item("a-tag", "First", "Something", ["array aggregator"]),
    ]);
    const result = index.retrieve({ query: "array aggregator", platform: "n8n", limit: 3 });
    expect(result.chunks.map((chunk) => chunk.documentId)).toEqual([
      "n8n.exact",
      "n8n.a-tag",
      "n8n.b-tag",
    ]);
  });

  it("enforces platform isolation and handles empty or unmatched queries", () => {
    const index = new KnowledgeIndex();
    index.build(loadKnowledgePacks());
    const make = index.retrieve({ query: "iterator", platform: "make" });
    expect(make.chunks.length).toBeGreaterThan(0);
    expect(make.chunks.every((chunk) => chunk.platform === "make")).toBe(true);
    expect(index.retrieve({ query: "", platform: "n8n" })).toEqual({ chunks: [] });
    expect(index.retrieve({ query: "term-that-does-not-exist", platform: "zapier" })).toEqual({ chunks: [] });
  });
});
