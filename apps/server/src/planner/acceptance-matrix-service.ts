import {
  acceptanceMatrixSchema,
  type AcceptanceMatrix,
  type AcceptanceMatrixEntry,
  type AcceptanceMetricSnapshot,
  type AcceptanceResult,
  type GraphCritique,
  type GraphRepairReport,
  type Platform,
  type PlatformTranslationResult,
  type V21AnalysisArtifacts,
  type V22ConceptualGraph,
} from "@awm/shared";
import { GraphCritic } from "./graph-critic.js";
import { SafeGraphRepairService } from "./safe-graph-repair.js";

const branchRoles = new Set([
  "true", "false", "route", "fallback", "parallel-branch", "conditional-branch",
  "approved", "rejected", "loop-entry", "loop-back", "loop-exit", "retry",
  "retry-exhausted", "merge-input", "resume", "timeout", "item", "item-result",
  "iteration-complete", "error", "handled", "subworkflow-return",
]);
const resultRank: Record<AcceptanceResult, number> = {
  PASS: 0, "PASS WITH WARNINGS": 1, "REVIEW REQUIRED": 2, FAIL: 3,
};

export class AcceptanceMatrixService {
  public constructor(
    private readonly critic = new GraphCritic(),
    private readonly repair = new SafeGraphRepairService(critic),
  ) {}

  public evaluate(
    v21: V21AnalysisArtifacts,
    conceptual: V22ConceptualGraph,
    translations: Record<Platform, PlatformTranslationResult>,
  ): AcceptanceMatrix {
    const conceptualEntry = this.conceptualEntry(v21, conceptual);
    const platformEntries = {
      n8n: this.platformEntry(v21, conceptual, translations.n8n),
      make: this.platformEntry(v21, conceptual, translations.make),
      zapier: this.platformEntry(v21, conceptual, translations.zapier),
    };
    const entries = [conceptualEntry, platformEntries.n8n, platformEntries.make, platformEntries.zapier];
    const worst = entries.reduce((value, item) => resultRank[item.result] > resultRank[value] ? item.result : value, "PASS" as AcceptanceResult);
    return acceptanceMatrixSchema.parse({
      version: "2.5",
      shadowMode: true,
      conceptual: conceptualEntry,
      platforms: platformEntries,
      aggregate: {
        result: worst,
        overallAcceptanceScore: round(entries.reduce((sum, item) => sum + item.stages.final.overallAcceptanceScore, 0) / entries.length),
        passedEntries: entries.filter((item) => item.result === "PASS").length,
        warningEntries: entries.filter((item) => item.result === "PASS WITH WARNINGS").length,
        reviewRequiredEntries: entries.filter((item) => item.result === "REVIEW REQUIRED").length,
        failedEntries: entries.filter((item) => item.result === "FAIL").length,
      },
    });
  }

  private conceptualEntry(v21: V21AnalysisArtifacts, graph: V22ConceptualGraph): AcceptanceMatrixEntry {
    const critique = this.critic.critiqueConceptual(graph);
    const repaired = this.repair.repair(v21, graph).conceptual;
    const original = conceptualMetrics(graph, graph, critique, null);
    const final = conceptualMetrics(graph, repaired.graph, repaired.report.afterCritique, repaired.report);
    return entry("conceptual", null, original, critiqueMetrics(original, critique), repairMetrics(final, repaired.report), final);
  }

  private platformEntry(v21: V21AnalysisArtifacts, conceptual: V22ConceptualGraph, translation: PlatformTranslationResult): AcceptanceMatrixEntry {
    const critique = this.critic.critiquePlatform(conceptual, translation);
    const repaired = this.repair.repair(v21, conceptual, translation).platform!;
    const original = platformMetrics(conceptual, translation, critique, null);
    const final = platformMetrics(conceptual, repaired.graph, repaired.report.afterCritique, repaired.report);
    return entry("platform", translation.selectedPlatform, original, critiqueMetrics(original, critique), repairMetrics(final, repaired.report), final);
  }
}

function conceptualMetrics(original: V22ConceptualGraph, graph: V22ConceptualGraph, critique: GraphCritique, repair: GraphRepairReport | null): AcceptanceMetricSnapshot {
  const originalCapabilities = unique(original.nodes.flatMap((node) => node.capabilityGroupIds));
  const finalCapabilities = unique(graph.nodes.flatMap((node) => node.capabilityGroupIds));
  const roles = ratio(original.nodes.filter((node) => graph.nodes.some((candidate) => candidate.id === node.id && candidate.role === node.role)).length, original.nodes.length);
  const branches = branchCoverage(original, graph.edges.map((edge) => ({ conceptualEdgeIds: [edge.id], label: edge.label })));
  return snapshot({
    critique, repair, validationPassed: critique.valid && (repair?.validation.valid ?? true),
    traceabilityCoverage: critique.metrics.traceabilityCoverage,
    capabilityPreservation: coverage(originalCapabilities, finalCapabilities),
    conceptualRolePreservation: roles, platformCapabilitySafety: 1,
    translationCompleteness: 1, branchPreservation: branches,
    warningCount: critique.aggregate.warningCount,
    unresolvedOperationCount: critique.metrics.unresolvedOperationCount,
  });
}

function platformMetrics(conceptual: V22ConceptualGraph, graph: PlatformTranslationResult, critique: GraphCritique, repair: GraphRepairReport | null): AcceptanceMetricSnapshot {
  const expectedCapabilities = unique(conceptual.nodes.flatMap((node) => node.capabilityGroupIds));
  const mappedCapabilities = unique(graph.nodes.flatMap((node) => node.capabilityGroupIds));
  const mappedConceptualNodes = unique(graph.nodes.flatMap((node) => node.conceptualNodeIds));
  return snapshot({
    critique, repair, validationPassed: critique.valid && graph.diagnostics.valid && (repair?.validation.valid ?? true),
    traceabilityCoverage: critique.metrics.traceabilityCoverage,
    capabilityPreservation: coverage(expectedCapabilities, mappedCapabilities),
    conceptualRolePreservation: critique.metrics.conceptualRolePreservationRate,
    platformCapabilitySafety: critique.metrics.platformCapabilitySafetyRate,
    translationCompleteness: coverage(conceptual.nodes.map((node) => node.id), mappedConceptualNodes),
    branchPreservation: branchCoverage(conceptual, graph.edges),
    warningCount: graph.warnings.length + critique.aggregate.warningCount,
    unresolvedOperationCount: critique.metrics.unresolvedOperationCount,
  });
}

function snapshot(input: {
  critique: GraphCritique; repair: GraphRepairReport | null; validationPassed: boolean;
  traceabilityCoverage: number; capabilityPreservation: number; conceptualRolePreservation: number;
  platformCapabilitySafety: number; translationCompleteness: number; branchPreservation: number;
  warningCount: number; unresolvedOperationCount: number;
}): AcceptanceMetricSnapshot {
  const applied = input.repair?.actions.filter((action) => action.status === "applied").length ?? 0;
  const skipped = input.repair?.actions.filter((action) => action.status === "skipped").length ?? 0;
  const review = input.repair?.remainingReviewRequiredIssues.length
    ?? input.critique.issues.filter((issue) => issue.repairSafety !== "safe").length;
  const semantic = round(100 * (
    input.traceabilityCoverage * 0.25 + input.capabilityPreservation * 0.2
    + input.conceptualRolePreservation * 0.2 + input.branchPreservation * 0.2
    + input.translationCompleteness * 0.15
  ));
  const rawOverall = semantic * 0.55 + (input.validationPassed ? 15 : 0)
    + input.platformCapabilitySafety * 15 + input.translationCompleteness * 10
    + (input.repair && input.repair.validation.valid ? 5 : 0)
    - input.critique.aggregate.errorCount * 20 - review * 4
    - input.unresolvedOperationCount * 2 - input.warningCount;
  return {
    validationPassed: input.validationPassed,
    criticErrorCount: input.critique.aggregate.errorCount,
    criticWarningCount: input.critique.aggregate.warningCount,
    criticSuggestionCount: input.critique.aggregate.suggestionCount,
    repairAppliedCount: applied, repairSkippedCount: skipped,
    unrepairedReviewRequiredCount: review,
    traceabilityCoverage: roundRate(input.traceabilityCoverage),
    capabilityPreservation: roundRate(input.capabilityPreservation),
    conceptualRolePreservation: roundRate(input.conceptualRolePreservation),
    platformCapabilitySafety: roundRate(input.platformCapabilitySafety),
    translationCompleteness: roundRate(input.translationCompleteness),
    branchPreservation: roundRate(input.branchPreservation),
    warningCount: input.warningCount,
    unresolvedOperationCount: input.unresolvedOperationCount,
    semanticQualityScore: semantic,
    overallAcceptanceScore: Math.max(0, Math.min(100, round(rawOverall))),
  };
}

function entry(
  graphKind: "conceptual" | "platform", platform: Platform | null,
  original: AcceptanceMetricSnapshot, critic: AcceptanceMetricSnapshot,
  repair: AcceptanceMetricSnapshot, final: AcceptanceMetricSnapshot,
): AcceptanceMatrixEntry {
  const reasons: string[] = [];
  let result: AcceptanceResult;
  if (!final.validationPassed || final.criticErrorCount > 0 || final.platformCapabilitySafety < 1) {
    result = "FAIL";
    reasons.push("Validation, critical critic findings, or platform capability safety did not meet the mandatory threshold.");
  } else if (final.unrepairedReviewRequiredCount > 0 || final.overallAcceptanceScore < 70) {
    result = "REVIEW REQUIRED";
    reasons.push("One or more meaning-sensitive findings require human review.");
  } else if (final.warningCount > 0 || final.unresolvedOperationCount > 0 || final.overallAcceptanceScore < 90) {
    result = "PASS WITH WARNINGS";
    reasons.push("The graph is valid and safe but retains explicit warnings or unresolved platform operations.");
  } else {
    result = "PASS";
    reasons.push("All deterministic acceptance thresholds passed.");
  }
  return { graphKind, platform, stages: { original, critic, repair, final }, result, reasons };
}

function critiqueMetrics(original: AcceptanceMetricSnapshot, critique: GraphCritique): AcceptanceMetricSnapshot {
  return { ...original, criticErrorCount: critique.aggregate.errorCount, criticWarningCount: critique.aggregate.warningCount, criticSuggestionCount: critique.aggregate.suggestionCount };
}

function repairMetrics(final: AcceptanceMetricSnapshot, report: GraphRepairReport): AcceptanceMetricSnapshot {
  return {
    ...final,
    repairAppliedCount: report.actions.filter((action) => action.status === "applied").length,
    repairSkippedCount: report.actions.filter((action) => action.status === "skipped").length,
  };
}

function branchCoverage(conceptual: V22ConceptualGraph, translated: Array<{ conceptualEdgeIds: string[]; label: string }>) {
  const expected = conceptual.edges.filter((edge) => branchRoles.has(edge.role));
  if (!expected.length) return 1;
  const preserved = expected.filter((edge) => translated.some((candidate) => candidate.conceptualEdgeIds.includes(edge.id) && candidate.label === edge.label));
  return ratio(preserved.length, expected.length);
}

function coverage(expected: string[], actual: string[]) {
  if (!expected.length) return 1;
  const values = new Set(actual);
  return ratio(expected.filter((value) => values.has(value)).length, expected.length);
}

function unique(values: string[]) { return [...new Set(values)]; }
function ratio(numerator: number, denominator: number) { return denominator ? numerator / denominator : 1; }
function round(value: number) { return Number(value.toFixed(2)); }
function roundRate(value: number) { return Number(value.toFixed(4)); }
