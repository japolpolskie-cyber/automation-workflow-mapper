import { describe, expect, it } from "vitest";
import type {
  KnowledgeChunk,
  KnowledgePlatform,
  RetrievalResult,
} from "./contracts.js";
import { adaptPlannerRetrievalRequest } from "./planner-retrieval-adapter.js";
import { buildPlannerRetrievalContext } from "./planner-retrieval-context.js";
import { ScopeIntelligenceService } from "../analysis/scope-intelligence.js";

const chunk = (
  id: string,
  platform: KnowledgePlatform,
  content: string,
): KnowledgeChunk => ({
  id,
  documentId: `document-${id}`,
  platform,
  title: `Title ${id}`,
  content,
  category: "action",
  tags: [],
  source: { id: "catalog", version: "1.0" },
  version: "1.0",
});

const result = (chunks: KnowledgeChunk[]): RetrievalResult => ({
  chunks,
  scores: chunks.map((item, index) => ({
    chunkId: item.id,
    combinedScore: 1 - index * 0.1,
    keywordScore: 1 - index * 0.1,
    vectorScore: 0,
  })),
});

describe("Planner retrieval request and context", () => {
  it("adapts existing requirements with an explicit selected platform", () => {
    const scope = "When an Asana task changes, notify Slack.";
    const analysis = new ScopeIntelligenceService().analyze(scope);
    const request = adaptPlannerRetrievalRequest(scope, "n8n", analysis, 5);
    expect(request).toMatchObject({ platform: "n8n", limit: 5, strategy: "hybrid" });
    expect(request.query).toContain(scope);
  });

  it("bounds chunk count, per-chunk content, and total content while preserving traceability", () => {
    const context = buildPlannerRetrievalContext(
      result([
        chunk("n8n.one", "n8n", "a".repeat(100)),
        chunk("n8n.two", "n8n", "b".repeat(100)),
        chunk("n8n.three", "n8n", "c".repeat(100)),
      ]),
      "n8n",
      "keyword-vector",
      "hybrid",
      { maximumResults: 2, maximumChunkCharacters: 40, maximumContextCharacters: 60 },
    );
    expect(context?.items).toHaveLength(2);
    expect(context?.items.map((item) => item.content.length)).toEqual([40, 20]);
    expect(context?.items[0]).toMatchObject({
      chunkId: "n8n.one",
      documentId: "document-n8n.one",
      sourceId: "catalog",
      sourceVersion: "1.0",
      score: 1,
    });
  });

  it("rejects mixed-platform and structurally invalid retrieval results", () => {
    expect(() => buildPlannerRetrievalContext(
      result([chunk("n8n.one", "n8n", "valid"), chunk("make.leak", "make", "leak")]),
      "n8n",
      "provider",
      "hybrid",
    )).toThrow(/platform isolation/);
    expect(() => buildPlannerRetrievalContext(
      { chunks: null, scores: [] } as unknown as RetrievalResult,
      "n8n",
      "provider",
      "hybrid",
    )).toThrow(/invalid/);
  });
});
