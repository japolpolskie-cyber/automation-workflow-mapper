import { z } from 'zod';

export const repairActionSchema = z.object({
  id: z.string().uuid(),
  repairId: z.string().min(1),
  operation: z.enum(['add', 'update', 'remove', 'replace', 'reconnect', 'clarify']),
  targetType: z.enum(['workflow', 'node', 'connection', 'branch']),
  targetId: z.string().nullable().default(null),
  reason: z.string().min(1).max(2_000),
  confidence: z.number().min(0).max(1),
  status: z.enum(['proposed', 'applied', 'skipped', 'failed']),
  issueCodes: z.array(z.string().min(1)).default([]),
}).strict();

export const repairReportSchema = z.object({
  version: z.literal('1.0'),
  workflowId: z.string().uuid(),
  attempt: z.number().int().nonnegative(),
  maximumAttempts: z.number().int().positive(),
  actions: z.array(repairActionSchema).default([]),
  unresolvedIssueCodes: z.array(z.string().min(1)).default([]),
  validBefore: z.boolean(),
  validAfter: z.boolean(),
  createdAt: z.string().datetime(),
}).strict().refine((value) => value.attempt <= value.maximumAttempts, { message: 'Repair attempt exceeds the configured maximum.' });

export type RepairAction = z.infer<typeof repairActionSchema>;
export type RepairReport = z.infer<typeof repairReportSchema>;
