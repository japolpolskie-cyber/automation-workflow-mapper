import { describe, expect, it } from "vitest";
import { loadKnowledgePack, loadKnowledgePacks } from "./knowledge-pack-loader.js";

describe("Hybrid RAG knowledge packs", () => {
  it("adapts existing knowledge into isolated versioned platform packs", () => {
    for (const platform of ["n8n", "make", "zapier"] as const) {
      const pack = loadKnowledgePack(platform);
      expect(pack.length).toBeGreaterThan(0);
      expect(pack.every((item) => item.platform === platform)).toBe(true);
      expect(pack.every((item) => item.id.startsWith(`${platform}.`))).toBe(true);
      expect(pack.every((item) => item.source.id && item.source.version && item.version)).toBe(true);
    }
    expect(loadKnowledgePacks().length).toBe(
      loadKnowledgePack("n8n").length +
        loadKnowledgePack("make").length +
        loadKnowledgePack("zapier").length,
    );
  });
});
