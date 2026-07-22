import { describe, expect, it } from "vitest";
import type { KnowledgeChunk, RetrievalResult } from "./contracts.js";
import { fuseRetrievalResults, HYBRID_FUSION_WEIGHTS } from "./hybrid-fusion.js";

const chunk = (id: string): KnowledgeChunk => ({
  id,
  documentId: `document-${id}`,
  platform: "n8n",
  title: id,
  content: id,
  category: "action",
  tags: [],
  source: { id: "test", version: "1" },
  version: "1",
});
const result = (
  entries: Array<{ chunk: KnowledgeChunk; keyword: number; vector: number }>,
): RetrievalResult => ({
  chunks: entries.map((entry) => entry.chunk),
  scores: entries.map((entry) => ({
    chunkId: entry.chunk.id,
    combinedScore: Math.max(entry.keyword, entry.vector),
    keywordScore: entry.keyword,
    vectorScore: entry.vector,
  })),
});

describe("hybrid fusion", () => {
  it("deduplicates chunks and exposes weighted source score breakdown", () => {
    const shared = chunk("n8n.shared");
    const fused = fuseRetrievalResults(
      result([{ chunk: shared, keyword: 1, vector: 0 }]),
      result([{ chunk: shared, keyword: 0, vector: 0.8 }]),
      "n8n",
    );
    expect(fused.chunks).toHaveLength(1);
    expect(fused.scores[0]).toEqual({
      chunkId: "n8n.shared",
      keywordScore: 1,
      vectorScore: 0.8,
      combinedScore: 1 * HYBRID_FUSION_WEIGHTS.keyword + 0.8 * HYBRID_FUSION_WEIGHTS.vector,
    });
  });

  it("ranks deterministically, limits results, and drops platform leakage", () => {
    const a = chunk("n8n.a");
    const b = chunk("n8n.b");
    const leaked = { ...chunk("make.leaked"), platform: "make" as const };
    const fused = fuseRetrievalResults(
      result([
        { chunk: b, keyword: 1, vector: 0 },
        { chunk: a, keyword: 1, vector: 0 },
        { chunk: leaked, keyword: 1, vector: 0 },
      ]),
      result([]),
      "n8n",
      1,
    );
    expect(fused.chunks.map((item) => item.id)).toEqual(["n8n.a"]);
  });
});
