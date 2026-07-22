import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  createApplicationDependencies,
  registerApplicationDependencies,
} from "./dependencies.js";

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
      provider: "keyword",
      mode: "off",
      indexedDocumentCount: expect.any(Number),
      indexedChunkCount: expect.any(Number),
      platformCounts: {
        n8n: expect.any(Number),
        make: expect.any(Number),
        zapier: expect.any(Number),
      },
    });
    await app.close();
  });
});
