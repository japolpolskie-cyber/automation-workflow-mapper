import { z } from "zod";

export const plannerV2PromotionModeSchema = z.enum(["disabled", "compare", "guarded", "enabled"]);

export function resolvePlannerV2PromotionMode(
  explicitMode: string | undefined,
  runtimeDefault: PlannerV2PromotionMode = "disabled",
): PlannerV2PromotionMode {
  return plannerV2PromotionModeSchema.parse(explicitMode ?? runtimeDefault);
}

export function resolvePackagedDesktopPlannerV2PromotionMode(explicitMode: string | undefined): PlannerV2PromotionMode {
  return explicitMode === "disabled" ? "disabled" : "guarded";
}
export const promotionGateSchema = z.object({
  id: z.enum([
    "conceptual-validation", "platform-validation", "capability-safety",
    "acceptance-result", "critic-errors", "review-required-findings",
    "blocking-unresolved-operations", "single-entry", "canonical-adaptation",
    "canonical-validation",
  ]),
  passed: z.boolean(),
  detail: z.string().min(1),
}).strict();

export const promotionDecisionSchema = z.object({
  version: z.literal("2.6"),
  configuredMode: plannerV2PromotionModeSchema,
  selectedPlatform: z.enum(["n8n", "make", "zapier"]),
  providerCandidateStatus: z.enum(["not-run", "available", "failed"]),
  v2CandidateStatus: z.enum(["not-run", "available", "failed", "rejected"]),
  acceptanceResult: z.enum(["PASS", "PASS WITH WARNINGS", "REVIEW REQUIRED", "FAIL"]).nullable(),
  gates: z.array(promotionGateSchema),
  passedGates: z.array(z.string().min(1)),
  failedGates: z.array(z.string().min(1)),
  authoritativeSource: z.enum(["provider", "v2"]),
  fallbackReason: z.string().min(1).nullable(),
  warnings: z.array(z.string().min(1)),
  timing: z.object({
    v2Milliseconds: z.number().nonnegative(),
    providerMilliseconds: z.number().nonnegative(),
    totalMilliseconds: z.number().nonnegative(),
  }).strict(),
  requestCorrelationId: z.string().min(1).nullable(),
}).strict();

export type PlannerV2PromotionMode = z.infer<typeof plannerV2PromotionModeSchema>;
export type PromotionGate = z.infer<typeof promotionGateSchema>;
export type PromotionDecision = z.infer<typeof promotionDecisionSchema>;
