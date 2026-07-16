import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import type { SemanticRoleSlot, SymbolNamespace, SymbolTable } from '@awm/shared';

type JsonSchema = {
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  enum?: unknown[];
  [key: string]: unknown;
};

const namespaceByField: Readonly<Record<string, SymbolNamespace>> = {
  sourceApplicationSymbols: 'application',
  destinationApplicationSymbols: 'application',
  unresolvedClarificationSymbols: 'clarification',
  blockedByClarificationSymbols: 'clarification',
  blockingClarificationSymbols: 'clarification',
  factSymbols: 'fact',
  evidenceSymbols: 'evidence',
  patternSymbols: 'pattern',
  knowledgeSymbols: 'knowledge',
  canonicalFunctionSymbol: 'canonical-function',
  canonicalFunctionSymbols: 'canonical-function',
  capabilitySymbols: 'capability',
};

export function buildControlledOutputSchema(outputSchema: z.ZodType, input: unknown): Record<string, unknown> {
  const schema = zodToJsonSchema(outputSchema, { $refStrategy: 'none' }) as JsonSchema;
  const table = typeof input === 'object' && input !== null && 'symbolTable' in input ? (input as { symbolTable: SymbolTable }).symbolTable : null;
  const roleSlots = typeof input === 'object' && input !== null && 'roleSlots' in input ? (input as { roleSlots: SemanticRoleSlot[] }).roleSlots : [];
  if (!table) return schema;
  const visit = (node: JsonSchema) => {
    if (node.properties) {
      if (node.properties.roleSlotIndex && node.properties.canonicalFunctionSymbol && roleSlots.length && !node.oneOf && node['x-role-constraint'] !== true) {
        node.oneOf = roleSlots.map((slot, index) => ({
          'x-role-constraint': true,
          properties: {
            roleSlotIndex: { enum: [index] },
            semanticRole: { enum: [slot.role] },
            canonicalFunctionSymbol: { enum: slot.allowedCanonicalFunctionSymbols },
            inputShape: { enum: [slot.inputShape] },
            outputShape: { enum: [slot.outputShape] },
          },
        }));
      }
      for (const [field, property] of Object.entries(node.properties)) {
        const namespace = namespaceByField[field];
        if (namespace && node['x-role-constraint'] !== true) {
          const allowed = (table.namespaces[namespace] ?? []).map((item) => item.symbol);
          if (property.items) property.items.enum = allowed;
          else property.enum = allowed;
        }
        visit(property);
      }
    }
    if (node.items) visit(node.items);
    for (const branch of [...(node.anyOf ?? []), ...(node.oneOf ?? []), ...(node.allOf ?? [])]) visit(branch);
  };
  visit(schema);
  return schema;
}
