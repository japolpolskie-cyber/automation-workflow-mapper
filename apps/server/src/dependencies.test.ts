import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  createApplicationDependencies,
  registerApplicationDependencies,
} from "./dependencies.js";
import type { HybridRAGProvider } from "./hybrid-rag/hybrid-rag-service.js";

describe("application dependency registration", () => {
  it("registers an initialized Hybrid RAG service without invoking retrieval", async () => {
    const app = Fastify();
    const dependencies = await createApplicationDependencies({
      HYBRID_RAG_MODE: "off",
    });

    registerApplicationDependencies(app, dependencies);

    expect(app.dependencies.hybridRAGService).toBe(
      dependencies.hybridRAGService,
    );
    await expect(app.dependencies.hybridRAGService.health()).resolves.toMatchObject({
      initialized: true,
      ready: true,
      provider: "keyword-vector",
      mode: "off",
      indexedDocumentCount: expect.any(Number),
      indexedChunkCount: expect.any(Number),
      platformCounts: {
        n8n: expect.any(Number),
        make: expect.any(Number),
        zapier: expect.any(Number),
      },
      embeddingProvider: "local-hash@1.0",
      embeddingReady: true,
      vectorDimensions: 64,
      vectorIndexHealthy: true,
      lastIndexBuildStatus: "ready",
      supportedRetrievalStrategies: ["keyword", "vector", "hybrid"],
    });
    await app.close();
  });

  it("keeps application dependencies available when Hybrid RAG initialization fails", async () => {
    const failedProvider: HybridRAGProvider = {
      name: "failed",
      initialize: async () => { throw new Error("initialization failed"); },
      retrieve: async () => ({ chunks: [], scores: [] }),
      health: async () => ({
        initialized: false, ready: false, indexedDocumentCount: 0, indexedChunkCount: 0,
        platformCounts: { n8n: 0, make: 0, zapier: 0 }, embeddingProvider: null,
        embeddingReady: false, vectorDimensions: null, indexedVectorCount: 0,
        vectorIndexHealthy: false, lastIndexBuildStatus: "failed",
        supportedRetrievalStrategies: ["keyword", "vector", "hybrid"],
      }),
    };
    const dependencies = await createApplicationDependencies({ HYBRID_RAG_MODE: "enabled" }, failedProvider);
    await expect(dependencies.hybridRAGService.health()).resolves.toMatchObject({ ready: false, provider: "failed" });
  });
});
