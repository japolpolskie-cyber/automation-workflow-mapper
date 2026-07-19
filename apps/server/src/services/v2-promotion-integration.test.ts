import { afterEach, describe, expect, it, vi } from "vitest";
import { leadQualificationWorkflow, type Platform } from "@awm/shared";
import type { AnalysisProvider } from "../ai/providers/analysis-provider.js";
import { ScopeIntelligenceService } from "../analysis/scope-intelligence.js";
import { createDatabase, type Database } from "../database/database.js";
import { UnifiedPlannerRuntime, type PlannerRuntime, type PlannerRuntimeResult } from "../planner/planner-runtime-service.js";
import { V2PromotionService } from "../planner/v2-promotion-service.js";
import { ProjectRepository } from "../repositories/project-repository.js";
import { AnalysisService } from "./analysis-service.js";

const databases: Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });
const scope = "When an Asana task is created, retrieve its details and notify Slack.";

function passingArtifacts(platform: Platform): PlannerRuntimeResult {
  const analysis = new ScopeIntelligenceService().analyze(scope, new Date("2026-07-19T00:00:00.000Z"));
  const result = new UnifiedPlannerRuntime("mock", null, null).buildV2Artifacts(scope, platform, analysis);
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

function setup(mode: "compare" | "guarded" | "enabled", validV2 = true) {
  const database = createDatabase(":memory:"); databases.push(database);
  const repository = new ProjectRepository(database);
  const project = repository.create({ name: "Promotion integration", clientName: "", description: "", platform: "n8n" });
  repository.updateScope(project.id, scope);
  const analyze = vi.fn(async () => structuredClone(leadQualificationWorkflow));
  const provider: AnalysisProvider = {
    name: "local", analyze,
    async getStatus() { return { provider: "local", available: true, models: [], message: "ready" }; },
  };
  const artifacts = validV2 ? passingArtifacts("n8n") : {};
  const runtime: PlannerRuntime = {
    mode: "mock",
    buildV2Artifacts: () => structuredClone(artifacts),
    async execute() { return structuredClone(artifacts); },
  };
  const persist = vi.spyOn(repository, "updateWorkflow");
  const service = new AnalysisService(
    repository, provider, undefined, new ScopeIntelligenceService(), runtime,
    new V2PromotionService({ mode, allowPassWithWarnings: false }),
  );
  return { analyze, persist, project, repository, service };
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
