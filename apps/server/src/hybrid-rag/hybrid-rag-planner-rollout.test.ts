import { describe, expect, it, vi } from "vitest";
import { leadQualificationWorkflow } from "@awm/shared";
import { ScopeIntelligenceService } from "../analysis/scope-intelligence.js";
import type { PlannerRuntime, PlannerRuntimeResult } from "../planner/planner-runtime-service.js";
import { HybridRAGPlannerRollout } from "./hybrid-rag-planner-rollout.js";
import type { PlannerRAGPreparation } from "./planner-rag-integration.js";

const scope = "When a webhook arrives, process each attachment in n8n.";
const analysis = new ScopeIntelligenceService().analyze(scope);
const context = {
  strategy: "hybrid" as const,
  provider: "keyword-vector",
  items: [{
    chunkId: "n8n.split-out#1", documentId: "n8n.split-out", platform: "n8n" as const,
    title: "Split Out", content: "Split an array into items.", score: 0.9,
    sourceId: "catalog", sourceVersion: "1",
  }],
};
const prepared = (fallbackReason: string | null = null): PlannerRAGPreparation => ({
  context: fallbackReason ? null : context,
  diagnostics: {
    retrievalAttempted: true, retrievalUsed: !fallbackReason, fallbackReason,
    selectedStrategy: "hybrid", suppliedChunkCount: fallbackReason ? 0 : 1,
    suppliedContextLength: fallbackReason ? 0 : context.items[0]!.content.length,
    timedOut: fallbackReason === "retrieval_timeout", retrievalDurationMs: 4,
  },
});
const provider = { name: "local" } as never;
const runtime = () => {
  const execute = vi.fn(async (...args: unknown[]): Promise<PlannerRuntimeResult> => ({
    plannerShadow: { error: args[6] ? "rag" : "existing" } as never,
  }));
  return { value: { mode: "shadow", execute, buildV2Artifacts: vi.fn() } as unknown as PlannerRuntime, execute };
};
const integration = (value: PlannerRAGPreparation) => ({ prepare: vi.fn(async () => value) }) as never;

describe("Hybrid RAG Planner rollout", () => {
  it("keeps OFF on the unchanged planner path", async () => {
    const planner = runtime();
    const rollout = new HybridRAGPlannerRollout("off", integration(prepared()));
    const output = await rollout.execute(planner.value, provider, scope, "n8n", analysis, leadQualificationWorkflow);
    expect(planner.execute).toHaveBeenCalledTimes(1);
    expect(planner.execute.mock.calls[0]?.[6]).toBeUndefined();
    expect(output.diagnostics).toMatchObject({ mode: "off", plannerPathSelected: "existing", comparisonExecuted: false });
  });

  it("runs both paths in COMPARE and returns only the existing result", async () => {
    const planner = runtime();
    const output = await new HybridRAGPlannerRollout("compare", integration(prepared())).execute(
      planner.value, provider, scope, "n8n", analysis, leadQualificationWorkflow,
    );
    expect(planner.execute).toHaveBeenCalledTimes(2);
    expect(output.result.plannerShadow?.error).toBe("existing");
    expect(output.diagnostics).toMatchObject({
      mode: "compare", plannerPathSelected: "existing", fallbackOccurred: false,
      comparisonExecuted: true, chunkCount: 1,
    });
  });

  it.each(["guarded", "enabled"] as const)("uses validated RAG context in %s mode", async (mode) => {
    const planner = runtime();
    const output = await new HybridRAGPlannerRollout(mode, integration(prepared())).execute(
      planner.value, provider, scope, "n8n", analysis, leadQualificationWorkflow,
    );
    expect(planner.execute).toHaveBeenCalledTimes(1);
    expect(planner.execute.mock.calls[0]?.[6]).toEqual(context);
    expect(output.diagnostics).toMatchObject({ plannerPathSelected: "hybrid-rag", fallbackOccurred: false });
  });

  it.each([
    "retrieval_timeout", "provider_unhealthy", "no_results", "retrieval_failed",
    "Retrieval result violated platform isolation.", "Retrieval result is invalid.",
  ])("falls back to the existing planner for %s", async (reason) => {
    const planner = runtime();
    const output = await new HybridRAGPlannerRollout("guarded", integration(prepared(reason))).execute(
      planner.value, provider, scope, "n8n", analysis, leadQualificationWorkflow,
    );
    expect(planner.execute).toHaveBeenCalledTimes(1);
    expect(planner.execute.mock.calls[0]?.[6]).toBeUndefined();
    expect(output.diagnostics).toMatchObject({
      plannerPathSelected: "existing", fallbackOccurred: true, fallbackReason: reason,
    });
  });

  it("falls back when the RAG-assisted planner path throws", async () => {
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error("rag_planner_failed"))
      .mockResolvedValueOnce({ v21Analysis: { sourceHash: "existing" } });
    const planner = { mode: "shadow", execute, buildV2Artifacts: vi.fn() } as unknown as PlannerRuntime;
    const output = await new HybridRAGPlannerRollout("enabled", integration(prepared())).execute(
      planner, provider, scope, "n8n", analysis, leadQualificationWorkflow,
    );
    expect(execute).toHaveBeenCalledTimes(2);
    expect(output.diagnostics).toMatchObject({ fallbackOccurred: true, fallbackReason: "rag_planner_failed", plannerPathSelected: "existing" });
  });
});
