import { describe, expect, it } from 'vitest';
import { p36BusinessIntentOutputSchema, p36WorkflowSkeletonOutputSchema, symbolTableSchema } from './index.js';

describe('P3.6 controlled vocabulary contracts', () => {
  it('requires a versioned and content-addressed symbol table', () => {
    expect(() => symbolTableSchema.parse({ version: '1.0.0', catalogVersion: '1.0.0', snapshotHash: 'bad', namespaces: {} })).toThrow();
  });

  it('uses numeric references in Stage A and Stage B model outputs', () => {
    expect(p36BusinessIntentOutputSchema.shape.sourceApplicationSymbols).toBeDefined();
    expect(p36WorkflowSkeletonOutputSchema.shape.workflows).toBeDefined();
    expect(() => p36BusinessIntentOutputSchema.parse({
      businessObjective: 'Test', actors: [], sourceApplicationSymbols: ['asana'], destinationApplicationSymbols: [],
      unresolvedSystems: [], businessEntities: [], businessOutcomes: [], constraints: [], explicitBusinessRules: [],
      unresolvedClarificationSymbols: [], decompositionHints: [], factSymbols: [], patternSymbols: [],
      workflowBoundaryCandidates: [{ title: 'Test', purpose: 'Test', factSymbols: [] }],
    })).toThrow();
  });
});
