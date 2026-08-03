import { describe, expect, it, vi } from "vitest";
import type { Platform } from "@awm/shared";
import { ScopeIntelligenceService } from "../analysis/scope-intelligence.js";
import { UnifiedPlannerRuntime, type PlannerRuntimeResult } from "./planner-runtime-service.js";
import { V2PromotionService } from "./v2-promotion-service.js";

const scope = "When an Asana task is created, retrieve its details and notify Slack.";

function artifacts(platform: Platform = "n8n", inputScope = scope): PlannerRuntimeResult {
  const analysis = new ScopeIntelligenceService().analyze(inputScope, new Date("2026-07-19T00:00:00.000Z"));
  const result = new UnifiedPlannerRuntime("mock", null, null).buildV2Artifacts(inputScope, platform, analysis);
  const selected = result.v25AcceptanceMatrix!.platforms[platform];
  selected.result = "PASS";
  selected.stages.final.validationPassed = true;
  selected.stages.final.platformCapabilitySafety = 1;
  selected.stages.final.criticErrorCount = 0;
  selected.stages.final.unrepairedReviewRequiredCount = 0;
  selected.stages.final.unresolvedOperationCount = 0;
  result.v22ConceptualGraph!.validation = { valid: true, issues: [] };
  result.v24GraphRepair!.conceptual.report.validation = { valid: true, issues: [] };
  result.v24GraphRepair!.platform!.report.validation = { valid: true, issues: [] };
  return result;
}

function evaluate(mode: "disabled" | "compare" | "guarded" | "enabled", input = artifacts(), allow = false) {
  return new V2PromotionService({ mode, allowPassWithWarnings: allow }).evaluate(input, "Promotion Test", scope, "n8n", "request-1", 4, "available");
}

describe("V2.6 controlled production promotion", () => {
  it("keeps disabled mode provider-authoritative", () => {
    const result = evaluate("disabled");
    expect(result.candidate).toBeNull();
    expect(result.decision.authoritativeSource).toBe("provider");
  });

  it("keeps compare mode provider-authoritative even when every gate passes", () => {
    const result = evaluate("compare");
    expect(result.candidate).toBeNull();
    expect(result.decision.failedGates).toEqual([]);
    expect(result.decision.authoritativeSource).toBe("provider");
  });

  it("tolerates missing V2 artifacts in compare mode", () => {
    const result = evaluate("compare", {});
    expect(result.candidate).toBeNull();
    expect(result.decision.v2CandidateStatus).toBe("rejected");
  });

  it("promotes a fully passing guarded candidate", () => {
    const result = evaluate("guarded");
    expect(result.candidate?.targetPlatform).toBe("n8n");
    expect(result.decision.authoritativeSource).toBe("v2");
    expect(result.decision.failedGates).toEqual([]);
  });

  it("rejects PASS WITH WARNINGS by default and permits it only explicitly", () => {
    const input = artifacts();
    input.v25AcceptanceMatrix!.platforms.n8n.result = "PASS WITH WARNINGS";
    expect(evaluate("guarded", structuredClone(input)).candidate).toBeNull();
    expect(evaluate("guarded", structuredClone(input), true).candidate).not.toBeNull();
  });

  it.each(["REVIEW REQUIRED", "FAIL"] as const)("falls back on %s", (acceptance) => {
    const input = artifacts();
    input.v25AcceptanceMatrix!.platforms.n8n.result = acceptance;
    expect(evaluate("guarded", input).candidate).toBeNull();
  });

  it("falls back on conceptual validation failure", () => {
    const input = artifacts();
    input.v22ConceptualGraph!.validation.valid = false;
    expect(evaluate("guarded", input).decision.failedGates).toContain("conceptual-validation");
  });

  it("falls back on platform validation failure", () => {
    const input = artifacts();
    input.v24GraphRepair!.platform!.report.validation.valid = false;
    expect(evaluate("guarded", input).decision.failedGates).toContain("platform-validation");
  });

  it("falls back below 100% capability safety", () => {
    const input = artifacts();
    input.v25AcceptanceMatrix!.platforms.n8n.stages.final.platformCapabilitySafety = 0.999;
    expect(evaluate("guarded", input).decision.failedGates).toContain("capability-safety");
  });

  it("falls back when canonical adaptation fails", () => {
    const adapter = { adapt: vi.fn(() => { throw new Error("adapter failed"); }) };
    const result = new V2PromotionService({ mode: "guarded", allowPassWithWarnings: false }, adapter as never)
      .evaluate(artifacts(), "Test", scope, "n8n", null, 1, "available");
    expect(result.candidate).toBeNull();
    expect(result.decision.failedGates).toContain("canonical-adaptation");
  });

  it("rejects a translated iterator with a missing loop-back instead of promoting partial V2 output", () => {
    const input = artifacts("n8n", "For every attachment, process the file and combine all results into one report.");
    const conceptualLoopBack = input.v24GraphRepair!.conceptual.graph.edges.find((edge) => edge.role === "loop-back")!;
    input.v24GraphRepair!.platform!.graph.edges = input.v24GraphRepair!.platform!.graph.edges.filter((edge) => !edge.conceptualEdgeIds.includes(conceptualLoopBack.id));
    const result = evaluate("guarded", input);
    expect(result.candidate).toBeNull();
    expect(result.decision.failedGates).toContain("canonical-validation");
    expect(result.decision.authoritativeSource).toBe("provider");
  });

  it("prefers V2 in enabled mode and retains mandatory fallback", () => {
    expect(evaluate("enabled").candidate).not.toBeNull();
    expect(evaluate("enabled", {}).candidate).toBeNull();
  });

  it("uses only the selected platform translation as the authoritative candidate", () => {
    const input = artifacts("n8n");
    input.v24GraphRepair!.platform!.graph.selectedPlatform = "make";
    const result = evaluate("guarded", input);
    expect(result.candidate).toBeNull();
    expect(result.decision.failedGates).toContain("canonical-adaptation");
  });

  it("emits safe structured diagnostics without requirements or credentials", () => {
    const observe = vi.fn();
    new V2PromotionService({ mode: "guarded", allowPassWithWarnings: false }, undefined, observe)
      .evaluate(artifacts(), "Test", scope, "n8n", "request-42", 3, "available");
    const diagnostic = observe.mock.calls[0]![0];
    expect(diagnostic.requestCorrelationId).toBe("request-42");
    expect(diagnostic.failedGates).toEqual([]);
    expect(JSON.stringify(diagnostic)).not.toContain(scope);
    expect(JSON.stringify(diagnostic)).not.toMatch(/credential|secret/i);
  });
});
