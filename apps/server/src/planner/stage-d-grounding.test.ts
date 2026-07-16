import { describe, expect, it } from 'vitest';
import {
  stageDEdgeGroundingInputSchema,
  structuredWorkflowPlanSchema,
  type GroundedNode,
  type PlannerContext,
} from '@awm/shared';
import { StageDEdgeGrounder } from './stage-d-edge-grounder.js';
import { StageDGroundingService } from './stage-d-grounding-service.js';

const node = (nodeId: string, canonicalFunctionId: string, purpose: string, input: GroundedNode['inputCardinality'] = 'single', output: GroundedNode['outputCardinality'] = 'single'): GroundedNode => ({
  contractVersion: '1.0.0', nodeId, canonicalFunctionId, semanticRole: canonicalFunctionId,
  applicationId: null, operationId: null, applicationLabel: null, operationLabel: null, purpose,
  semanticInputs: [], semanticOutputs: ['stepResult'], inputCardinality: input, outputCardinality: output,
  capabilityReferences: [], knowledgeReferences: [], platformMappingStatus: 'unresolved',
  mappingLimitations: [], alternatives: [], groundingMethod: 'unresolved',
  groundingProvenance: ['Fixture.'], blockingClarificationReferences: [], unresolvedRequirement: 'Fixture.',
  selectedApplicationSymbol: null, selectedOperationSymbol: null,
});

const context: PlannerContext = {
  version: '1.0', objective: 'Did the lead respond?', platform: 'n8n',
  facts: [{ id: 'fact-decision', kind: 'decision', value: 'Did the lead respond?', explanation: 'Explicit decision.', entityId: 'lead', evidenceIds: ['ev-1'] }],
  evidence: [{ id: 'ev-1', evidenceType: 'explicit', ruleId: 'test', ruleVersion: '1.0.0', text: 'Did the lead respond?', explanation: 'Explicit.', sourceStart: 0, sourceEnd: 21 }],
  clarifications: [], patterns: [], knowledge: [], capabilities: [], allowedApplications: [],
  allowedCanonicalFunctions: [], supportedOperations: [], constraints: [],
};

const input = stageDEdgeGroundingInputSchema.parse({
  contractVersion: '1.0.0', edgeId: 'edge-yes', sourceNodeId: 'decision', targetNodeId: 'end',
  sourceSemanticRole: 'binary-decision', targetSemanticRole: 'successful-end',
  sourceCanonicalFunction: 'binary-condition', targetCanonicalFunction: 'end',
  sourceGrounding: node('decision', 'binary-condition', 'Did the lead respond?'),
  targetGrounding: node('end', 'end', 'Stop follow-up', 'single', 'none'),
  topologyRole: 'true', topologyLabel: 'TRUE', topologyCondition: 'response exists',
  topologyPurpose: 'Stop follow-up when a response exists.',
  relevantFacts: [{ id: 'fact-decision', kind: 'decision', value: 'Did the lead respond?', entityId: 'lead' }],
  evidenceReferences: ['ev-1'], patternReferences: ['follow-up-until-response'],
  sourceCardinality: 'single', targetCardinality: 'single', blockingClarificationReferences: [],
  platform: 'n8n', capabilityLimitations: [], allowedEdgeTypes: ['true', 'unresolved'],
  symbolTableSnapshotHash: 'symbols', patternVersion: 'k3.1', capabilityVersion: '2.0.0',
});

describe('Stage D edge grounding', () => {
  it('grounds meaningful TRUE semantics without a model call', async () => {
    const result = await new StageDEdgeGrounder().ground(input, new AbortController().signal);
    expect(result.edge.edgeType).toBe('true');
    expect(result.edge.sourceHandle).toBe('true');
    expect(result.edge.displayLabel).toContain('Did the lead respond');
    expect(result.edge.groundingMethod).toBe('deterministic');
    expect(result.modelLatencyMs).toBe(0);
  });

  it('rejects model symbols outside the bounded edge table', async () => {
    const ambiguous = { ...input, topologyRole: 'ambiguous', allowedEdgeTypes: ['route', 'unresolved'] as const };
    const selector = { modelId: 'bounded-test', select: async () => ({ edgeTypeSymbol: 999, conditionSummary: 'x', dataFlowCategories: [], reason: 'x' }) };
    await expect(new StageDEdgeGrounder(selector).ground(stageDEdgeGroundingInputSchema.parse(ambiguous), new AbortController().signal)).rejects.toThrow('unknown or disallowed');
  });

  it('preserves P4 topology and Stage C nodes and reuses cached edge results', async () => {
    const plan = structuredWorkflowPlanSchema.parse({
      version: '1.1', objective: context.objective, platform: 'n8n', entryNodeId: 'decision',
      nodes: [
        { id: 'decision', canonicalFunctionId: 'binary-condition', title: 'Did the lead respond?', applicationRef: null, operationRef: null, inputs: [], outputs: ['decision'], factIds: ['fact-decision'], patternIds: ['follow-up-until-response'], knowledgeIds: [], capabilityIds: [], blockedByClarificationIds: [], limitationAcknowledgements: [] },
        { id: 'yes', canonicalFunctionId: 'end', title: 'Stop follow-up', applicationRef: null, operationRef: null, inputs: ['decision'], outputs: [], factIds: ['fact-decision'], patternIds: [], knowledgeIds: [], capabilityIds: [], blockedByClarificationIds: [], limitationAcknowledgements: [] },
        { id: 'no', canonicalFunctionId: 'action', title: 'Continue follow-up', applicationRef: null, operationRef: null, inputs: ['decision'], outputs: ['result'], factIds: ['fact-decision'], patternIds: [], knowledgeIds: [], capabilityIds: [], blockedByClarificationIds: [], limitationAcknowledgements: [] },
      ],
      edges: [
        { id: 'yes-edge', source: 'decision', target: 'yes', condition: 'response exists', label: 'TRUE', purpose: 'Response received.', businessReason: 'Stop follow-up.', ruleId: 'binary.true', evidenceIds: ['ev-1'] },
        { id: 'no-edge', source: 'decision', target: 'no', condition: 'no response exists', label: 'FALSE', purpose: 'No response.', businessReason: 'Continue follow-up.', ruleId: 'binary.false', evidenceIds: ['ev-1'] },
      ],
      binaryConditions: [{ nodeId: 'decision', trueEdgeId: 'yes-edge', falseEdgeId: 'no-edge' }],
      routers: [], merges: [], loops: [], retries: [], blockedByClarificationIds: [], warnings: [],
    });
    const nodes = [node('decision', 'binary-condition', 'Did the lead respond?'), node('yes', 'end', 'Stop follow-up', 'single', 'none'), node('no', 'action', 'Continue follow-up')];
    const service = new StageDGroundingService({ enabled: true, maximumConcurrency: 2, edgeTimeoutMs: 5_000, maximumRetries: 1, cacheEnabled: true, maximumOutputCharacters: 30_000 });
    const first = await service.ground(plan, nodes, context);
    const second = await service.ground(plan, nodes, context);
    expect(first.validationIssues).toEqual([]);
    expect(first.topologyUnchanged).toBe(true);
    expect(first.stageCNodesUnchanged).toBe(true);
    expect(first.edges.map((edge) => edge.sourceHandle)).toEqual(['true', 'false']);
    expect(second.metrics.cacheHits).toBe(2);
    expect(second.persisted).toBe(false);
  });
});
