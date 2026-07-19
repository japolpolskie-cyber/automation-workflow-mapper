import {
  promotionDecisionSchema,
  validateWorkflowGraph,
  type CanonicalWorkflow,
  type PlannerV2PromotionMode,
  type PromotionDecision,
  type PromotionGate,
  type Platform,
} from "@awm/shared";
import type { PlannerRuntimeResult } from "./planner-runtime-service.js";
import { V2CanonicalWorkflowAdapter } from "./v2-canonical-workflow-adapter.js";

export interface PromotionOptions {
  mode: PlannerV2PromotionMode;
  allowPassWithWarnings: boolean;
}
export interface PromotionEvaluation {
  candidate: CanonicalWorkflow | null;
  decision: PromotionDecision;
}

export class V2PromotionService {
  public constructor(
    private readonly options: PromotionOptions,
    private readonly adapter = new V2CanonicalWorkflowAdapter(),
    private readonly observe: (diagnostic: PromotionDecision) => void = () => {},
  ) {}

  public get mode() { return this.options.mode; }

  public evaluate(
    artifacts: PlannerRuntimeResult,
    projectName: string,
    objective: string,
    platform: Platform,
    requestCorrelationId: string | null,
    elapsedMilliseconds: number,
    providerStatus: PromotionDecision["providerCandidateStatus"],
    providerMilliseconds = 0,
  ): PromotionEvaluation {
    const conceptual = artifacts.v22ConceptualGraph;
    const repair = artifacts.v24GraphRepair;
    const matrix = artifacts.v25AcceptanceMatrix;
    const selected = matrix?.platforms[platform];
    const gates: PromotionGate[] = [];
    const gate = (id: PromotionGate["id"], passed: boolean, detail: string) => gates.push({ id, passed, detail });
    gate("conceptual-validation", Boolean(conceptual?.validation.valid && repair?.conceptual.report.validation.valid), conceptual?.validation.valid ? "Conceptual validation passed." : "Conceptual validation failed.");
    gate("platform-validation", Boolean(repair?.platform?.report.validation.valid && selected?.stages.final.validationPassed), selected?.stages.final.validationPassed ? "Selected platform validation passed." : "Selected platform validation failed.");
    gate("capability-safety", selected?.stages.final.platformCapabilitySafety === 1, `Capability safety: ${selected?.stages.final.platformCapabilitySafety ?? 0}.`);
    const acceptedResult = selected?.result === "PASS" || (this.options.allowPassWithWarnings && selected?.result === "PASS WITH WARNINGS");
    gate("acceptance-result", acceptedResult, `Acceptance result: ${selected?.result ?? "missing"}.`);
    gate("critic-errors", selected?.stages.final.criticErrorCount === 0, `Remaining critic errors: ${selected?.stages.final.criticErrorCount ?? 0}.`);
    gate("review-required-findings", selected?.stages.final.unrepairedReviewRequiredCount === 0, `Review-required findings: ${selected?.stages.final.unrepairedReviewRequiredCount ?? 0}.`);
    gate("blocking-unresolved-operations", selected?.stages.final.unresolvedOperationCount === 0, `Blocking unresolved operations: ${selected?.stages.final.unresolvedOperationCount ?? 0}.`);

    let candidate: CanonicalWorkflow | null = null;
    let adaptationError: string | null = null;
    try {
      if (!conceptual || !repair?.platform) throw new Error("Required V2 graph artifacts are missing.");
      if (repair.platform.graph.selectedPlatform !== platform) throw new Error("Selected translator does not match the requested platform.");
      candidate = this.adapter.adapt(projectName, objective, repair.conceptual.graph, repair.platform.graph);
    } catch (error) {
      adaptationError = error instanceof Error ? error.message : "Canonical adaptation failed.";
    }
    gate("canonical-adaptation", candidate !== null, candidate ? "Canonical adaptation succeeded." : adaptationError ?? "Canonical adaptation failed.");
    const entries = candidate?.nodes.filter((node) => node.category === "trigger" || node.category === "start").length ?? 0;
    gate("single-entry", entries === 1, `Canonical entry count: ${entries}.`);
    const canonicalValidation = candidate ? validateWorkflowGraph(candidate) : null;
    gate("canonical-validation", Boolean(canonicalValidation?.valid), canonicalValidation?.valid ? "Final canonical validation passed." : "Final canonical validation failed.");

    const promotable = gates.every((item) => item.passed);
    const authoritativeSource = promotable && (this.options.mode === "guarded" || this.options.mode === "enabled") ? "v2" : "provider";
    const failedGates = gates.filter((item) => !item.passed).map((item) => item.id);
    const decision = promotionDecisionSchema.parse({
      version: "2.6", configuredMode: this.options.mode, selectedPlatform: platform,
      providerCandidateStatus: providerStatus,
      v2CandidateStatus: promotable ? "available" : "rejected",
      acceptanceResult: selected?.result ?? null,
      gates,
      passedGates: gates.filter((item) => item.passed).map((item) => item.id),
      failedGates,
      authoritativeSource,
      fallbackReason: authoritativeSource === "provider" && this.options.mode !== "compare"
        ? failedGates.length ? `V2 promotion gates failed: ${failedGates.join(", ")}.` : "V2 promotion is disabled."
        : null,
      warnings: selected?.stages.final.warningCount ? [`V2 candidate retains ${selected.stages.final.warningCount} warning(s).`] : [],
      timing: { v2Milliseconds: elapsedMilliseconds, providerMilliseconds, totalMilliseconds: elapsedMilliseconds + providerMilliseconds },
      requestCorrelationId,
    });
    this.observe(decision);
    return { candidate: authoritativeSource === "v2" ? candidate : null, decision };
  }

  public recordFailure(platform: Platform, requestCorrelationId: string | null, reason: string, v2Milliseconds: number, providerStatus: PromotionDecision["providerCandidateStatus"], providerMilliseconds = 0) {
    const decision = promotionDecisionSchema.parse({
      version: "2.6", configuredMode: this.options.mode, selectedPlatform: platform,
      providerCandidateStatus: providerStatus, v2CandidateStatus: "failed", acceptanceResult: null,
      gates: [], passedGates: [], failedGates: ["v2-construction"],
      authoritativeSource: "provider", fallbackReason: reason,
      warnings: ["V2 candidate construction failed; the provider path remains authoritative."],
      timing: { v2Milliseconds, providerMilliseconds, totalMilliseconds: v2Milliseconds + providerMilliseconds },
      requestCorrelationId,
    });
    this.observe(decision);
    return decision;
  }
}
