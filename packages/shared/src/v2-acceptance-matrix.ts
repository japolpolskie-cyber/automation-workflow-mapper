import { z } from "zod";

export const acceptanceResultSchema = z.enum(["PASS", "PASS WITH WARNINGS", "REVIEW REQUIRED", "FAIL"]);
const acceptancePlatformSchema = z.enum(["n8n", "make", "zapier"]);

export const acceptanceMetricSnapshotSchema = z.object({
  validationPassed: z.boolean(),
  criticErrorCount: z.number().int().nonnegative(),
  criticWarningCount: z.number().int().nonnegative(),
  criticSuggestionCount: z.number().int().nonnegative(),
  repairAppliedCount: z.number().int().nonnegative(),
  repairSkippedCount: z.number().int().nonnegative(),
  unrepairedReviewRequiredCount: z.number().int().nonnegative(),
  traceabilityCoverage: z.number().min(0).max(1),
  capabilityPreservation: z.number().min(0).max(1),
  conceptualRolePreservation: z.number().min(0).max(1),
  platformCapabilitySafety: z.number().min(0).max(1),
  translationCompleteness: z.number().min(0).max(1),
  branchPreservation: z.number().min(0).max(1),
  warningCount: z.number().int().nonnegative(),
  unresolvedOperationCount: z.number().int().nonnegative(),
  semanticQualityScore: z.number().min(0).max(100),
  overallAcceptanceScore: z.number().min(0).max(100),
}).strict();

export const acceptanceMatrixEntrySchema = z.object({
  graphKind: z.enum(["conceptual", "platform"]),
  platform: acceptancePlatformSchema.nullable(),
  stages: z.object({
    original: acceptanceMetricSnapshotSchema,
    critic: acceptanceMetricSnapshotSchema,
    repair: acceptanceMetricSnapshotSchema,
    final: acceptanceMetricSnapshotSchema,
  }).strict(),
  result: acceptanceResultSchema,
  reasons: z.array(z.string().min(1)),
}).strict();

export const acceptanceMatrixSchema = z.object({
  version: z.literal("2.5"),
  shadowMode: z.literal(true),
  conceptual: acceptanceMatrixEntrySchema,
  platforms: z.object({
    n8n: acceptanceMatrixEntrySchema,
    make: acceptanceMatrixEntrySchema,
    zapier: acceptanceMatrixEntrySchema,
  }).strict(),
  aggregate: z.object({
    result: acceptanceResultSchema,
    overallAcceptanceScore: z.number().min(0).max(100),
    passedEntries: z.number().int().nonnegative(),
    warningEntries: z.number().int().nonnegative(),
    reviewRequiredEntries: z.number().int().nonnegative(),
    failedEntries: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export type AcceptanceResult = z.infer<typeof acceptanceResultSchema>;
export type AcceptanceMetricSnapshot = z.infer<typeof acceptanceMetricSnapshotSchema>;
export type AcceptanceMatrixEntry = z.infer<typeof acceptanceMatrixEntrySchema>;
export type AcceptanceMatrix = z.infer<typeof acceptanceMatrixSchema>;
