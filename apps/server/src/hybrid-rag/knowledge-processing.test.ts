import { describe, expect, it } from "vitest";
import type { KnowledgeDocument } from "./contracts.js";
import { chunkKnowledgeDocument } from "./knowledge-chunker.js";
import { normalizeKnowledgeDocument } from "./knowledge-normalizer.js";

const document: KnowledgeDocument = {
  id: "N8N.Custom Item",
  platform: "n8n",
  title: "  Custom   Item  ",
  content: "Keep   the original words, but normalize whitespace.",
  category: " Data Transformation ",
  tags: [" Mapping ", "mapping", " Fields "],
  source: { id: "Catalog Source", version: " 1.0 " },
  version: " 1.0 ",
};

describe("Hybrid RAG knowledge processing", () => {
  it("normalizes searchable fields and stable IDs deterministically", () => {
    const first = normalizeKnowledgeDocument(document);
    const second = normalizeKnowledgeDocument(document);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      id: "n8n.custom-item",
      title: "Custom Item",
      category: "data transformation",
      tags: ["fields", "mapping"],
      source: { id: "catalog-source", version: "1.0" },
    });
    expect(first.content).toBe("Keep the original words, but normalize whitespace.");
  });

  it("keeps small documents whole and creates bounded stable chunks", () => {
    const normalized = normalizeKnowledgeDocument(document);
    expect(chunkKnowledgeDocument(normalized, 100)).toHaveLength(1);
    const chunks = chunkKnowledgeDocument(
      { ...normalized, content: "one two three four five six seven eight" },
      13,
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.length <= 13)).toBe(true);
    expect(chunks.map((chunk) => chunk.id)).toEqual(
      chunks.map((_, index) => `n8n.custom-item#${index + 1}`),
    );
    expect(chunks.every((chunk) => chunk.platform === "n8n")).toBe(true);
  });
});
