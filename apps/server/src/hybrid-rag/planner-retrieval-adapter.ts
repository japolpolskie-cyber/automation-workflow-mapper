import type { DetectedProcessSummary, Platform } from "@awm/shared";
import type { RetrievalRequest } from "./contracts.js";

export function adaptPlannerRetrievalRequest(
  requirements: string,
  platform: Platform,
  analysis: DetectedProcessSummary,
  limit: number,
): RetrievalRequest {
  const applications = analysis.facts
    .filter((fact) => fact.kind === "application")
    .map((fact) => fact.value);
  const query = [requirements.trim(), applications.length ? `Applications: ${applications.join(", ")}` : ""]
    .filter(Boolean)
    .join("\n");
  return { query, platform, limit, strategy: "hybrid" };
}
