import { z } from 'zod';

export const symbolTableVersion = '1.0.0' as const;
export const symbolNamespaces = [
  'application',
  'canonical-function',
  'pattern',
  'capability',
  'clarification',
  'fact',
  'evidence',
  'knowledge',
] as const;
export const symbolNamespaceSchema = z.enum(symbolNamespaces);

export const symbolEntrySchema = z.object({
  symbol: z.number().int().positive(),
  stableId: z.string().min(1),
  label: z.string().min(1),
}).strict();

export const symbolTableSchema = z.object({
  version: z.literal(symbolTableVersion),
  catalogVersion: z.string().min(1),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  namespaces: z.record(symbolNamespaceSchema, z.array(symbolEntrySchema)),
}).strict();

export const symbolReferenceSchema = z.object({
  namespace: symbolNamespaceSchema,
  symbol: z.number().int().positive(),
}).strict();

export type SymbolNamespace = z.infer<typeof symbolNamespaceSchema>;
export type SymbolEntry = z.infer<typeof symbolEntrySchema>;
export type SymbolTable = z.infer<typeof symbolTableSchema>;
export type SymbolReference = z.infer<typeof symbolReferenceSchema>;

