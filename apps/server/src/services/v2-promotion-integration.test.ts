import { afterEach, describe, expect, it, vi } from "vitest";
import { leadQualificationWorkflow, type Platform } from "@awm/shared";
import type { AnalysisProvider } from "../ai/providers/analysis-provider.js";
import { ScopeIntelligenceService } from "../analysis/scope-intelligence.js";
import { createDatabase, type Database } from "../database/database.js";
import { UnifiedPlannerRuntime, type PlannerRuntime, type PlannerRuntimeResult } from "../planner/planner-runtime-service.js";
import { V2PromotionService } from "../planner/v2-promotion-service.js";
import { V2CanonicalWorkflowAdapter } from "../planner/v2-canonical-workflow-adapter.js";
import { ProjectRepository } from "../repositories/project-repository.js";
import { AnalysisService } from "./analysis-service.js";

const databases: Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });
const scope = "When an Asana task is created, retrieve its details and notify Slack.";

function passingArtifacts(platform: Platform, inputScope = scope): PlannerRuntimeResult {
  const analysis = new ScopeIntelligenceService().analyze(inputScope, new Date("2026-07-19T00:00:00.000Z"));
  const result = new UnifiedPlannerRuntime("mock", null, null).buildV2Artifacts(inputScope, platform, analysis);
  const selected = result.v25AcceptanceMatrix!.platforms[platform];
  selected.result = "PASS";
  Object.assign(selected.stages.final, {
    validationPassed: true, platformCapabilitySafety: 1, criticErrorCount: 0,
    unrepairedReviewRequiredCount: 0, unresolvedOperationCount: 0,
  });
  result.v22ConceptualGraph!.validation = { valid: true, issues: [] };
  result.v24GraphRepair!.conceptual.report.validation = { valid: true, issues: [] };
  result.v24GraphRepair!.platform!.report.validation = { valid: true, issues: [] };
  return result;
}

function setup(mode: "disabled" | "compare" | "guarded" | "enabled", validV2 = true, throwV2 = false, inputScope = scope) {
  const database = createDatabase(":memory:"); databases.push(database);
  const repository = new ProjectRepository(database);
  const project = repository.create({ name: "Promotion integration", clientName: "", description: "", platform: "n8n" });
  repository.updateScope(project.id, inputScope);
  const analyze = vi.fn(async () => structuredClone(leadQualificationWorkflow));
  const provider: AnalysisProvider = {
    name: "local", analyze,
    async getStatus() { return { provider: "local", available: true, models: [], message: "ready" }; },
  };
  const artifacts = validV2 ? passingArtifacts("n8n", inputScope) : {};
  const runtime: PlannerRuntime = {
    mode: "mock",
    buildV2Artifacts: () => {
      if (throwV2) throw new Error("synthetic V2 failure");
      return structuredClone(artifacts);
    },
    async execute() { return structuredClone(artifacts); },
  };
  const persist = vi.spyOn(repository, "updateWorkflow");
  const topologyDiagnostics: Array<{ outcome: string; warningCodes: string[] }> = [];
  const service = new AnalysisService(
    repository, provider, undefined, new ScopeIntelligenceService(), runtime,
    new V2PromotionService({ mode, allowPassWithWarnings: false }),
    null,
    (diagnostic) => topologyDiagnostics.push(diagnostic),
  );
  return { analyze, persist, project, repository, service, topologyDiagnostics };
}

describe("V2.6 AnalysisService source selection", () => {
  it("compare returns and persists the provider workflow exactly once", async () => {
    const test = setup("compare");
    const result = await test.service.analyze(test.project.id);
    expect(test.analyze).toHaveBeenCalledOnce();
    expect(test.persist).toHaveBeenCalledOnce();
    expect(result.workflow.id).toBe(leadQualificationWorkflow.id);
    expect("v25AcceptanceMatrix" in result).toBe(false);
  });

  it("guarded promotes only the V2 candidate and persists once", async () => {
    const test = setup("guarded");
    const result = await test.service.analyze(test.project.id);
    expect(test.analyze).toHaveBeenCalledOnce();
    expect(test.persist).toHaveBeenCalledOnce();
    expect(result.workflow.id).not.toBe(leadQualificationWorkflow.id);
    expect(test.repository.findById(test.project.id)?.workflow.id).toBe(result.workflow.id);
  });

  it("persists and reloads V2 iterator handles and all three execution paths", () => {
    const requirement = "For every attachment, process the file and combine all results into one report.";
    const test = setup("guarded", true, false, requirement);
    const artifacts = passingArtifacts("n8n", requirement);
    const candidate = new V2CanonicalWorkflowAdapter().adapt("Iterator persistence", requirement, artifacts.v24GraphRepair!.conceptual.graph, artifacts.v24GraphRepair!.platform!.graph);
    test.repository.updateWorkflow(test.project.id, candidate);
    const reloaded = test.repository.findById(test.project.id)!.workflow;
    const itemEdge = reloaded.connections.find((edge) => edge.sourcePort === "item")!;
    const iterator = reloaded.nodes.find((node) => node.id === itemEdge.sourceNodeId)!;
    expect(candidate.id).toBe(reloaded.id);
    expect(reloaded.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceNodeId: iterator.id, sourcePort: "item", label: "Each Item" }),
      expect.objectContaining({ targetNodeId: iterator.id, targetPort: "loop-back", label: "Loop Back" }),
      expect.objectContaining({ sourceNodeId: iterator.id, sourcePort: "done", label: "Completed" }),
    ]));
  });

  it("guarded preserves and persists only the provider candidate when a gate fails", async () => {
    const test = setup("guarded", false);
    const result = await test.service.analyze(test.project.id);
    expect(test.analyze).toHaveBeenCalledOnce();
    expect(test.persist).toHaveBeenCalledOnce();
    expect(result.workflow.id).toBe(leadQualificationWorkflow.id);
    expect(test.repository.findById(test.project.id)?.workflow.id).toBe(leadQualificationWorkflow.id);
  });

  it("keeps provider fallback authoritative and persists both conservatively repaired iterator edges", async () => {
    const requirement = "For every attachment, process the file and combine all results into one report.";
    const artifacts = passingArtifacts("n8n", requirement);
    const providerWorkflow = new V2CanonicalWorkflowAdapter().adapt("Provider iterator", requirement, artifacts.v24GraphRepair!.conceptual.graph, artifacts.v24GraphRepair!.platform!.graph);
    providerWorkflow.connections = providerWorkflow.connections.filter((edge) => edge.sourcePort !== "item" && edge.sourcePort !== "done");
    const test = setup("guarded", false, false, requirement);
    test.analyze.mockResolvedValue(providerWorkflow);
    const result = await test.service.analyze(test.project.id);
    const persisted = test.repository.findById(test.project.id)!.workflow;
    const iterator = persisted.nodes.find((node) => node.configuration.conceptualRole === "collection-iterator")!;
    const loopBack = persisted.connections.find((edge) => edge.targetNodeId === iterator.id && edge.targetPort === "loop-back")!;
    expect(result.workflow.id).toBe(providerWorkflow.id);
    expect(persisted.id).toBe(providerWorkflow.id);
    expect(persisted.connections.filter((edge) => edge.sourcePort === "item")).toEqual([
      expect.objectContaining({ targetPort: "input", label: "Each Item" }),
    ]);
    expect(persisted.connections.filter((edge) => edge.sourcePort === "done")).toEqual([
      expect.objectContaining({ targetPort: "input", label: "Completed", branchLabel: "DONE" }),
    ]);
    expect(loopBack).toMatchObject({ label: "Loop Back", targetPort: "loop-back" });
    expect(persisted.connections.some((edge) => edge.sourceNodeId === iterator.id && edge.sourcePort === "output" && edge.targetPort === "input")).toBe(false);
    expect(test.topologyDiagnostics).toEqual([
      { outcome: "provider-iterator-repaired-item-and-completed", warningCodes: [] },
    ]);
  });

  it("guarded preserves the provider candidate when V2 construction throws", async () => {
    const test = setup("guarded", true, true);
    const result = await test.service.analyze(test.project.id);
    expect(test.analyze).toHaveBeenCalledOnce();
    expect(test.persist).toHaveBeenCalledOnce();
    expect(result.workflow.id).toBe(leadQualificationWorkflow.id);
  });

  it("explicit disabled mode remains provider-authoritative", async () => {
    const test = setup("disabled");
    const result = await test.service.analyze(test.project.id);
    expect(test.analyze).toHaveBeenCalledOnce();
    expect(test.persist).toHaveBeenCalledOnce();
    expect(result.workflow.id).toBe(leadQualificationWorkflow.id);
  });

  it("enabled avoids provider execution when V2 passes", async () => {
    const test = setup("enabled");
    const result = await test.service.analyze(test.project.id);
    expect(test.analyze).not.toHaveBeenCalled();
    expect(test.persist).toHaveBeenCalledOnce();
    expect(result.workflow.id).not.toBe(leadQualificationWorkflow.id);
  });

  it("enabled invokes the provider once when V2 fails", async () => {
    const test = setup("enabled", false);
    const result = await test.service.analyze(test.project.id);
    expect(test.analyze).toHaveBeenCalledOnce();
    expect(test.persist).toHaveBeenCalledOnce();
    expect(result.workflow.id).toBe(leadQualificationWorkflow.id);
  });
});
