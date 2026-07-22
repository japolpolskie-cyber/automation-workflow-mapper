import { describe, expect, it, vi } from "vitest";
import { ScopeIntelligenceService } from "../analysis/scope-intelligence.js";
import type { HybridRAGHealth } from "./contracts.js";
import type { HybridRAGService } from "./hybrid-rag-service.js";
import { PlannerRAGIntegration } from "./planner-rag-integration.js";
import type { KnowledgeChunk, RetrievalResult } from "./contracts.js";

const scope = "When a webhook arrives in n8n, process each attachment.";
const analysis = new ScopeIntelligenceService().analyze(scope);
const item: KnowledgeChunk = {
  id: "n8n.split-out#1", documentId: "n8n.split-out", platform: "n8n",
  title: "Split Out", content: "Turns an array into individual items.", category: "iterator", tags: ["attachments"],
  source: { id: "catalog", version: "1" }, version: "1",
};
const validResult: RetrievalResult = {
  chunks: [item],
  scores: [{ chunkId: item.id, combinedScore: 0.9, keywordScore: 0.8, vectorScore: 1 }],
};
const health: HybridRAGHealth = {
  initialized: true, ready: true, provider: "keyword-vector", mode: "compare" as const,
  indexedDocumentCount: 1, indexedChunkCount: 1, platformCounts: { n8n: 1, make: 0, zapier: 0 },
  embeddingProvider: "local-hash@1.0", embeddingReady: true, vectorDimensions: 64,
  indexedVectorCount: 1, vectorIndexHealthy: true, lastIndexBuildStatus: "ready" as const,
  supportedRetrievalStrategies: ["keyword", "vector", "hybrid"],
};
const options = {
  timeoutMs: 50,
  maximumResults: 6,
  maximumChunkCharacters: 800,
  maximumContextCharacters: 4_000,
};
const service = (overrides: Partial<HybridRAGService> = {}): HybridRAGService => ({
  initialize: vi.fn(async () => true),
  retrieve: vi.fn(async () => validResult),
  health: vi.fn(async () => health),
  ...overrides,
});

describe("Planner RAG fallback boundary", () => {
  it("does not execute retrieval while mode is off", async () => {
    const ragService = service();
    const prepared = await new PlannerRAGIntegration("off", ragService, options).prepare(scope, "n8n", analysis);
    expect(ragService.retrieve).not.toHaveBeenCalled();
    expect(prepared).toEqual({
      context: null,
      diagnostics: {
        retrievalAttempted: false, retrievalUsed: false, fallbackReason: "mode_off",
        selectedStrategy: "hybrid", suppliedChunkCount: 0, suppliedContextLength: 0, timedOut: false,
        retrievalDurationMs: 0,
      },
    });
  });

  it("supplies valid bounded context with request-scoped diagnostics", async () => {
    const prepared = await new PlannerRAGIntegration("compare", service(), options).prepare(scope, "n8n", analysis);
    expect(prepared.context?.items[0]?.chunkId).toBe(item.id);
    expect(prepared.diagnostics).toMatchObject({
      retrievalAttempted: true, retrievalUsed: true, fallbackReason: null,
      suppliedChunkCount: 1, suppliedContextLength: item.content.length, timedOut: false,
    });
  });

  it("falls back for unhealthy, empty, exceptional, invalid, and timed-out retrieval", async () => {
    const cases: Array<{ value: HybridRAGService; reason: string; timedOut?: boolean }> = [
      { value: service({ health: vi.fn(async () => ({ ...health, ready: false })) }), reason: "provider_unhealthy" },
      { value: service({ retrieve: vi.fn(async () => ({ chunks: [], scores: [] })) }), reason: "no_results" },
      { value: service({ retrieve: vi.fn(async () => { throw new Error("retrieval_failed"); }) }), reason: "retrieval_failed" },
      { value: service({ retrieve: vi.fn(async (): Promise<RetrievalResult> => ({ chunks: [{ ...item, platform: "make" as const }], scores: validResult.scores })) }), reason: "Retrieval result violated platform isolation." },
      { value: service({ retrieve: vi.fn(() => new Promise<RetrievalResult>(() => undefined)) }), reason: "retrieval_timeout", timedOut: true },
    ];
    for (const testCase of cases) {
      const prepared = await new PlannerRAGIntegration("compare", testCase.value, options).prepare(scope, "n8n", analysis);
      expect(prepared.context).toBeNull();
      expect(prepared.diagnostics).toMatchObject({
        retrievalAttempted: true,
        retrievalUsed: false,
        fallbackReason: testCase.reason,
        timedOut: testCase.timedOut ?? false,
      });
    }
  });
});
