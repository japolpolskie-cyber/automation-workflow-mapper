import { describe, expect, it } from "vitest";
import type { Platform, PlatformTranslationResult } from "@awm/shared";
import { ScopeIntelligenceService } from "../analysis/scope-intelligence.js";
import { AcceptanceMatrixService } from "./acceptance-matrix-service.js";
import { DeterministicSkeletonCompiler } from "./deterministic-skeleton-compiler.js";
import { MakeConceptualTranslator } from "./make-translator.js";
import { N8nConceptualTranslator } from "./n8n-translator.js";
import { V21AnalysisService } from "./v2-analysis-service.js";
import { ZapierConceptualTranslator } from "./zapier-translator.js";

const service = new AcceptanceMatrixService();

function compile(scope: string) {
  const detected = new ScopeIntelligenceService().analyze(scope, new Date("2026-07-19T00:00:00.000Z"));
  const v21 = new V21AnalysisService().analyze(scope, detected);
  const graph = new DeterministicSkeletonCompiler().compileV22(v21).graph;
  const translations: Record<Platform, PlatformTranslationResult> = {
    n8n: new N8nConceptualTranslator().translate(graph),
    make: new MakeConceptualTranslator().translate(graph),
    zapier: new ZapierConceptualTranslator().translate(graph),
  };
  return { v21, graph, translations };
}

describe("V2.5 shadow acceptance matrix", () => {
  it("passes a clean conceptual graph deterministically", () => {
    const input = compile("When an Asana task is created, retrieve its details and notify Slack.");
    const result = service.evaluate(input.v21, input.graph, input.translations);
    expect(result.conceptual.stages.final.validationPassed).toBe(true);
    expect(result.conceptual.stages.final.traceabilityCoverage).toBe(1);
    expect(result.conceptual.stages.final.capabilityPreservation).toBe(1);
    expect(result.conceptual.result).toMatch(/PASS/);
  });

  it("reports explicit platform warnings without treating them as clean", () => {
    const input = compile("Wait for an external signature event and then continue.");
    const result = service.evaluate(input.v21, input.graph, input.translations);
    expect(Object.values(result.platforms).some((entry) => entry.stages.final.warningCount > 0)).toBe(true);
    expect(Object.values(result.platforms).some((entry) => entry.result !== "PASS")).toBe(true);
  });

  it("keeps meaning-sensitive findings review-required", () => {
    const input = compile("When a request arrives, complete the workflow.");
    const terminal = input.graph.nodes.find((node) => node.terminalOutcome !== null)!;
    terminal.terminalOutcome = "Done";
    const result = service.evaluate(input.v21, input.graph, {
      n8n: new N8nConceptualTranslator().translate(input.graph),
      make: new MakeConceptualTranslator().translate(input.graph),
      zapier: new ZapierConceptualTranslator().translate(input.graph),
    });
    expect(result.conceptual.stages.final.unrepairedReviewRequiredCount).toBeGreaterThan(0);
    expect(result.conceptual.result).toBe("REVIEW REQUIRED");
  });

  it("fails a structurally invalid conceptual graph", () => {
    const input = compile("Did the lead respond? If yes notify Slack; if no send Gmail.");
    input.graph.edges = input.graph.edges.slice(0, 1);
    const result = service.evaluate(input.v21, input.graph, {
      n8n: new N8nConceptualTranslator().translate(input.graph),
      make: new MakeConceptualTranslator().translate(input.graph),
      zapier: new ZapierConceptualTranslator().translate(input.graph),
    });
    expect(result.conceptual.stages.final.validationPassed).toBe(false);
    expect(result.conceptual.result).toBe("FAIL");
    expect(result.aggregate.result).toBe("FAIL");
  });

  it("evaluates n8n, Make, and Zapier through the same contract", () => {
    const input = compile("For every attachment, process the file and combine all results.");
    const result = service.evaluate(input.v21, input.graph, input.translations);
    expect(result.platforms.n8n.platform).toBe("n8n");
    expect(result.platforms.make.platform).toBe("make");
    expect(result.platforms.zapier.platform).toBe("zapier");
    expect(Object.values(result.platforms).every((entry) => entry.graphKind === "platform")).toBe(true);
  });

  it("shows a deterministic quality improvement after exact branch-label repair", () => {
    const input = compile("Did the lead respond? If yes notify Slack; if no send Gmail.");
    const edge = input.translations.n8n.edges.find((item) => item.label === "TRUE")!;
    edge.label = "Continue";
    const result = service.evaluate(input.v21, input.graph, input.translations);
    expect(result.platforms.n8n.stages.original.branchPreservation).toBeLessThan(1);
    expect(result.platforms.n8n.stages.final.branchPreservation).toBe(1);
    expect(result.platforms.n8n.stages.final.overallAcceptanceScore).toBeGreaterThan(result.platforms.n8n.stages.original.overallAcceptanceScore);
    expect(result.platforms.n8n.stages.repair.repairAppliedCount).toBeGreaterThan(0);
  });

  it("is deterministic and does not mutate source graphs or translations", () => {
    const input = compile("When an Asana task is created, notify Slack.");
    const originalGraph = structuredClone(input.graph);
    const originalTranslations = structuredClone(input.translations);
    const first = service.evaluate(input.v21, input.graph, input.translations);
    const second = service.evaluate(input.v21, input.graph, input.translations);
    expect(second).toEqual(first);
    expect(input.graph).toEqual(originalGraph);
    expect(input.translations).toEqual(originalTranslations);
  });
});
