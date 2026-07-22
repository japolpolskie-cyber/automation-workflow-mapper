import { describe, expect, it } from "vitest";
import type { PlannerRetrievalContext } from "@awm/shared";
import { ScopeIntelligenceService } from "../analysis/scope-intelligence.js";
import { buildP36IntentInput } from "./controlled-vocabulary.js";
import { PlannerContextBuilder } from "./planner-context-builder.js";
import { PlannerPromptBuilder } from "./planner-prompt-builder.js";

const scope = "When an n8n webhook arrives, process each attachment.";
const analysis = new ScopeIntelligenceService().analyze(scope);
const retrievalContext: PlannerRetrievalContext = {
  strategy: "hybrid",
  provider: "keyword-vector",
  items: [{
    chunkId: "n8n.split-out#1", documentId: "n8n.split-out", platform: "n8n",
    title: "Split Out", content: "Turns an array into individual items.", score: 0.9,
    sourceId: "platform-node-knowledge", sourceVersion: "1.0",
  }],
};

describe("Planner V2 optional RAG context", () => {
  it("preserves the previous planner context and prompt when no retrieval is supplied", () => {
    const context = new PlannerContextBuilder().build(scope, "n8n", analysis);
    expect(context.retrievalContext).toBeUndefined();
    expect(new PlannerPromptBuilder().build(context).sectionCharacterCounts["Hybrid Retrieval Context"]).toBeUndefined();
  });

  it("passes valid retrieval context through shadow and P3.6/P4 input boundaries", () => {
    const context = new PlannerContextBuilder().build(scope, "n8n", analysis, retrievalContext);
    const prompt = new PlannerPromptBuilder().build(context);
    expect(prompt.user).toContain("## Hybrid Retrieval Context");
    expect(prompt.user).toContain("n8n.split-out#1");
    const built = buildP36IntentInput("rag-test", scope, context, analysis.knowledgeContext.catalogVersion);
    expect(built.input.retrievalContext).toEqual(retrievalContext);
  });
});
