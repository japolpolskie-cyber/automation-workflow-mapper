import { z } from 'zod';

const diagnosticWaitSchema = z.object({
  value: z.string().min(1),
  kind: z.enum(['duration', 'event', 'unspecified']),
}).strict();

const scoreSummarySchema = z.object({
  score: z.number().int().min(0).max(100),
  level: z.enum(['low', 'medium', 'high']),
}).strict();

export const processAnalysisDiagnosticsSchema = z.object({
  version: z.literal('1.0'),
  rulesVersion: z.literal('1.0'),
  businessObjective: z.string().min(1),
  actors: z.array(z.string().min(1)),
  applicationsAndSystems: z.array(z.string().min(1)),
  triggers: z.array(z.string().min(1)),
  outcomes: z.array(z.string().min(1)),
  approvals: z.array(z.string().min(1)),
  waits: z.array(diagnosticWaitSchema),
  retries: z.array(z.string().min(1)),
  loops: z.array(z.string().min(1)),
  synchronizationSignals: z.array(z.string().min(1)),
  missingInformation: z.array(z.string().min(1)),
  clarificationAnswerContext: z.object({
    acceptedAnswerCount: z.number().int().nonnegative(),
    acceptedAnswerCategories: z.array(z.string().min(1)),
  }).strict().optional(),
  summary: z.object({
    confidence: scoreSummarySchema.extend({
      tracedSignals: z.number().int().nonnegative(),
      evidenceBackedSignals: z.number().int().nonnegative(),
      totalSignals: z.number().int().nonnegative(),
    }).strict(),
    coverage: scoreSummarySchema.extend({
      detectedCategories: z.number().int().nonnegative(),
      totalCategories: z.literal(10),
      missingInformationCount: z.number().int().nonnegative(),
    }).strict(),
  }).strict(),
}).strict();

export type ProcessAnalysisDiagnostics = z.infer<typeof processAnalysisDiagnosticsSchema>;
