import { z } from 'zod';

export const retrievedKnowledgeRefSchema = z.object({
  kind: z.enum(['canonical_function', 'manual', 'application', 'operation', 'pattern', 'platform_capability', 'validation_rule']),
  id: z.string().min(1),
  score: z.number().min(0).max(1),
  reason: z.string().min(1).max(1_000),
}).strict();

export const allowedCapabilitySchema = z.object({
  canonicalFunctionId: z.string().min(1),
  applicationId: z.string().min(1).nullable().default(null),
  operationId: z.string().min(1).nullable().default(null),
  limitation: z.string().min(1).nullable().default(null),
}).strict();

export const knowledgeContextSchema = z.object({
  version: z.literal('1.0'),
  planningFactsVersion: z.literal('1.0'),
  catalogVersion: z.string().min(1),
  retrieved: z.array(retrievedKnowledgeRefSchema).default([]),
  allowedCapabilities: z.array(allowedCapabilitySchema).default([]),
  hardRules: z.array(z.string().min(1)).default([]),
  estimatedCharacters: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
}).strict();

export type RetrievedKnowledgeRef = z.infer<typeof retrievedKnowledgeRefSchema>;
export type AllowedCapability = z.infer<typeof allowedCapabilitySchema>;
export type KnowledgeContext = z.infer<typeof knowledgeContextSchema>;
