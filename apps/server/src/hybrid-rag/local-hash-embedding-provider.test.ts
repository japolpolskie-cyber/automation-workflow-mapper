import { describe, expect, it } from "vitest";
import { LocalHashEmbeddingProvider } from "./local-hash-embedding-provider.js";

describe("local embedding provider", () => {
  it("initializes and embeds batches with consistent dimensions", async () => {
    const provider = new LocalHashEmbeddingProvider(16);
    await expect(provider.initialize()).resolves.toBe(true);
    const result = await provider.embed({ texts: ["route by status", "wait one day"] });
    expect(result.vectors).toHaveLength(2);
    expect(result.vectors.every((vector) => vector.length === 16)).toBe(true);
    expect(result.dimensions).toBe(16);
    await expect(provider.health()).resolves.toMatchObject({
      initialized: true,
      ready: true,
      dimensions: 16,
      provider: { name: "local-hash", version: "1.0" },
    });
  });

  it("produces deterministic vectors for identical normalized text", async () => {
    const provider = new LocalHashEmbeddingProvider();
    await provider.initialize();
    const result = await provider.embed({ texts: ["Route   By Status", "route by status"] });
    expect(result.vectors[0]).toEqual(result.vectors[1]);
  });
});
