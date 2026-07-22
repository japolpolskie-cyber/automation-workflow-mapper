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
    await expect(app.dependencies.hybridRAGService.health()).resolves.toEqual({
      initialized: true,
      ready: true,
      provider: "noop",
      mode: "off",
    });
    await app.close();
  });
});
