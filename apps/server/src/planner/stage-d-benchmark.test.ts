import { describe, expect, it } from 'vitest';
import { structuredWorkflowPlanSchema, type GroundedNode, type PlannerContext } from '@awm/shared';
import { StageDGroundingService } from './stage-d-grounding-service.js';

const evidence = { id: 'ev-scope', evidenceType: 'explicit' as const, ruleId: 'benchmark.scope', ruleVersion: '1.0.0', text: 'Real business automation benchmark.', explanation: 'Benchmark scope statement.', sourceStart: 0, sourceEnd: 35 };
const clarification = { id: 'clarify-interval', category: 'follow-up-interval', question: 'How long should the workflow wait?', reason: 'No interval is specified.', missingFact: 'follow-up interval', evidenceIds: ['ev-scope'] };
const context: PlannerContext = {
  version: '1.0', objective: 'Seven real business automation edge-grounding scenarios.', platform: 'n8n',
  facts: [{ id: 'fact-scope', kind: 'business_verb', value: 'route, iterate, follow up, merge, retry', explanation: 'Benchmark business semantics.', entityId: null, evidenceIds: ['ev-scope'] }],
  evidence: [evidence], clarifications: [clarification], patterns: [], knowledge: [], capabilities: [],
  allowedApplications: [], allowedCanonicalFunctions: [], supportedOperations: [], constraints: [],
};

interface NodeSpec { id: string; fn: string; title: string; input?: GroundedNode['inputCardinality']; output?: GroundedNode['outputCardinality']; blockers?: string[] }
interface EdgeSpec { id: string; source: string; target: string; label: string; condition?: string | null }
const nodeSpecs: NodeSpec[] = [
  { id: 'folder', fn: 'action', title: 'Create Google Drive folder' }, { id: 'subtask', fn: 'action', title: 'Create Asana subtask' }, { id: 'description', fn: 'action', title: 'Update Asana description' },
  { id: 'response', fn: 'binary-condition', title: 'Did the lead respond?' }, { id: 'stop', fn: 'end', title: 'Stop follow-up', output: 'none' }, { id: 'followup', fn: 'action', title: 'Continue follow-up', blockers: ['clarify-interval'] },
  { id: 'approved', fn: 'trigger', title: 'Approved entries received', input: 'none', output: 'collection' }, { id: 'entry-iterator', fn: 'iterator', title: 'Process each approved entry', input: 'collection' }, { id: 'add-row', fn: 'action', title: 'Add current Google Sheets row' }, { id: 'entries-done', fn: 'end', title: 'Approved entries complete', output: 'none' },
  { id: 'service', fn: 'multi-route-decision', title: 'Route by service type' }, { id: 'solar', fn: 'action', title: 'Send Solar recommendation' }, { id: 'hvac', fn: 'action', title: 'Send HVAC recommendation' }, { id: 'security', fn: 'action', title: 'Send Security recommendation' }, { id: 'manual', fn: 'manual-review', title: 'Review unknown service' },
  { id: 'attachments', fn: 'data-retrieval', title: 'Retrieve Gmail attachments', output: 'collection' }, { id: 'attachment-iterator', fn: 'iterator', title: 'Process each attachment', input: 'collection' }, { id: 'upload', fn: 'action', title: 'Upload current file' }, { id: 'uploads', fn: 'aggregator', title: 'Aggregate upload results', input: 'collection', output: 'collection' },
  { id: 'found', fn: 'binary-condition', title: 'Was the record found?' }, { id: 'create', fn: 'action', title: 'Create CRM record' }, { id: 'update', fn: 'action', title: 'Update CRM record' }, { id: 'record-merge', fn: 'merge', title: 'Merge create or update result' }, { id: 'record-next', fn: 'action', title: 'Continue with CRM record' },
  { id: 'technical-action', fn: 'action', title: 'Call external API' }, { id: 'retry', fn: 'retry', title: 'Retry technical failure' }, { id: 'manual-failure', fn: 'manual-review', title: 'Review exhausted retry' },
  { id: 'business-loop', fn: 'loop', title: 'Follow up until response' }, { id: 'wait', fn: 'delay', title: 'Wait for next follow-up', blockers: ['clarify-interval'] }, { id: 'loop-exit', fn: 'end', title: 'Follow-up complete', output: 'none' },
];
const edges: EdgeSpec[] = [
  { id: 'folder-subtask', source: 'folder', target: 'subtask', label: 'NEXT' }, { id: 'folder-description', source: 'folder', target: 'description', label: 'NEXT' },
  { id: 'response-yes', source: 'response', target: 'stop', label: 'TRUE', condition: 'a qualifying response exists' }, { id: 'response-no', source: 'response', target: 'followup', label: 'FALSE', condition: 'no qualifying response exists' },
  { id: 'approved-iterator', source: 'approved', target: 'entry-iterator', label: 'NEXT' }, { id: 'entry-item', source: 'entry-iterator', target: 'add-row', label: 'ITEM' }, { id: 'entry-done', source: 'entry-iterator', target: 'entries-done', label: 'DONE' },
  { id: 'service-solar', source: 'service', target: 'solar', label: 'Solar', condition: 'service type is Solar' }, { id: 'service-hvac', source: 'service', target: 'hvac', label: 'HVAC', condition: 'service type is HVAC' }, { id: 'service-security', source: 'service', target: 'security', label: 'Security', condition: 'service type is Security' }, { id: 'service-unknown', source: 'service', target: 'manual', label: 'Unknown — Manual Review', condition: 'no named service matches' },
  { id: 'attachments-iterator', source: 'attachments', target: 'attachment-iterator', label: 'NEXT' }, { id: 'attachment-item', source: 'attachment-iterator', target: 'upload', label: 'ITEM' }, { id: 'upload-result', source: 'upload', target: 'uploads', label: 'NEXT' },
  { id: 'found-yes', source: 'found', target: 'update', label: 'TRUE', condition: 'matching record exists' }, { id: 'found-no', source: 'found', target: 'create', label: 'FALSE', condition: 'matching record does not exist' }, { id: 'create-merge', source: 'create', target: 'record-merge', label: 'CREATED' }, { id: 'update-merge', source: 'update', target: 'record-merge', label: 'UPDATED' }, { id: 'merge-next', source: 'record-merge', target: 'record-next', label: 'NEXT' },
  { id: 'technical-failure', source: 'technical-action', target: 'retry', label: 'FAILED', condition: 'technical operation failed' }, { id: 'retry-attempt', source: 'retry', target: 'technical-action', label: 'RETRY', condition: 'attempts remain' }, { id: 'retry-exhausted', source: 'retry', target: 'manual-failure', label: 'EXHAUSTED', condition: 'attempt limit reached' },
  { id: 'loop-entry-edge', source: 'followup', target: 'business-loop', label: 'ENTER', condition: 'follow-up required' }, { id: 'loop-body', source: 'business-loop', target: 'wait', label: 'CONTINUE', condition: 'no response and attempts remain' }, { id: 'loop-back-edge', source: 'wait', target: 'business-loop', label: 'LOOP_BACK', condition: 'wait completed' }, { id: 'loop-exit-edge', source: 'business-loop', target: 'loop-exit', label: 'EXIT', condition: 'response received or attempt limit reached' },
];

const plan = structuredWorkflowPlanSchema.parse({
  version: '1.1', objective: context.objective, platform: 'n8n', entryNodeId: 'folder',
  nodes: nodeSpecs.map((spec) => ({ id: spec.id, canonicalFunctionId: spec.fn, title: spec.title, applicationRef: null, operationRef: null, inputs: [], outputs: [], factIds: ['fact-scope'], patternIds: [], knowledgeIds: [], capabilityIds: [], blockedByClarificationIds: spec.blockers ?? [], limitationAcknowledgements: [] })),
  edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, condition: edge.condition ?? null, label: edge.label, purpose: `${edge.source} to ${edge.target}`, businessReason: `${edge.source} result enables ${edge.target}.`, ruleId: 'benchmark.edge', evidenceIds: ['ev-scope'] })),
  binaryConditions: [{ nodeId: 'response', trueEdgeId: 'response-yes', falseEdgeId: 'response-no' }, { nodeId: 'found', trueEdgeId: 'found-yes', falseEdgeId: 'found-no' }],
  routers: [{ nodeId: 'service', routes: [
    { label: 'Solar', condition: 'service type is Solar', destination: 'solar', edgeId: 'service-solar' },
    { label: 'HVAC', condition: 'service type is HVAC', destination: 'hvac', edgeId: 'service-hvac' },
    { label: 'Security', condition: 'service type is Security', destination: 'security', edgeId: 'service-security' },
    { label: 'Unknown — Manual Review', condition: 'no named service matches', destination: 'manual', edgeId: 'service-unknown' },
  ] }],
  merges: [{ nodeId: 'record-merge', incomingBranches: ['create', 'update'], mergeStrategy: 'first_available', continuationEdgeId: 'merge-next' }],
  loops: [{ nodeId: 'business-loop', entryEdgeId: 'loop-entry-edge', bodyEntryNodeId: 'wait', bodyExitNodeId: 'wait', exitEdgeId: 'loop-exit-edge', terminationCondition: 'response received or attempt limit reached' }],
  retries: [{ nodeId: 'retry', targetNodeId: 'technical-action', maximumAttempts: 3, delay: 'bounded backoff', terminationCondition: 'attempt limit reached', failureEdgeId: 'technical-failure' }],
  blockedByClarificationIds: ['clarify-interval'], warnings: [],
});

const groundedNodes: GroundedNode[] = nodeSpecs.map((spec) => ({
  contractVersion: '1.0.0', nodeId: spec.id, canonicalFunctionId: spec.fn, semanticRole: spec.fn,
  applicationId: null, operationId: spec.id === 'folder' ? 'create-folder' : null, applicationLabel: null, operationLabel: null,
  purpose: spec.title, semanticInputs: [], semanticOutputs: spec.id === 'folder' ? ['folderId', 'folderUrl'] : ['stepResult'],
  inputCardinality: spec.input ?? 'single', outputCardinality: spec.output ?? (spec.fn === 'end' ? 'none' : 'single'),
  capabilityReferences: [], knowledgeReferences: [], platformMappingStatus: 'unresolved', mappingLimitations: [],
  alternatives: [], groundingMethod: 'unresolved', groundingProvenance: ['Benchmark fixture.'],
  blockingClarificationReferences: spec.blockers ?? [], unresolvedRequirement: 'Benchmark fixture.',
  selectedApplicationSymbol: null, selectedOperationSymbol: null,
}));

describe('Stage D seven-scenario benchmark', () => {
  it('grounds edge semantics safely without changing topology or Stage C nodes', async () => {
    const service = new StageDGroundingService({ enabled: true, maximumConcurrency: 6, edgeTimeoutMs: 5_000, maximumRetries: 1, cacheEnabled: true, maximumOutputCharacters: 30_000 });
    const report = await service.ground(plan, groundedNodes, context);
    const byId = (id: string) => report.edges.find((edge) => edge.edgeId === id)!;
    console.log(`STAGE_D_BENCHMARK=${JSON.stringify({ total: report.metrics.totalEdges, deterministic: report.metrics.deterministicallyGroundedEdges, model: report.metrics.modelGroundedEdges, unresolved: report.metrics.unresolvedEdges, invalidReferences: report.metrics.invalidReferences, genericLabels: report.metrics.genericLabels, topologyMutations: report.metrics.topologyMutations, stageCMutations: report.metrics.stageCMutations, cardinalityCorrectness: report.metrics.cardinalityTransitionCorrectness, averageDeterministicLatencyMs: report.metrics.averageDeterministicLatencyMs, retries: report.metrics.retries })}`);
    expect(report.validationIssues).toEqual([]);
    expect(report.metrics.deterministicallyGroundedEdges + report.metrics.modelGroundedEdges + report.metrics.unresolvedEdges).toBe(report.metrics.totalEdges);
    expect(report.metrics.totalEdges).toBe(26);
    expect(report.metrics.topologyMutations).toBe(0);
    expect(report.metrics.stageCMutations).toBe(0);
    expect(report.metrics.invalidReferences).toBe(0);
    expect(report.metrics.cardinalityTransitionCorrectness).toBe(1);
    expect(byId('folder-subtask').dataContractSummary).toEqual(['folder Id', 'folder Url']);
    expect(byId('response-yes').sourceHandle).toBe('true');
    expect(byId('response-no').clarificationReferences).toContain('clarify-interval');
    expect(byId('entry-item').cardinalityRelationship).toBe('collection item → single item');
    expect(['Solar', 'HVAC', 'Security', 'Unknown — Manual Review']).toEqual(['service-solar', 'service-hvac', 'service-security', 'service-unknown'].map((id) => byId(id).displayLabel));
    expect(byId('create-merge').edgeType).toBe('merge-input');
    expect(byId('upload-result').edgeType).toBe('item-result');
    expect(byId('technical-failure').edgeType).toBe('failure');
    expect(byId('retry-attempt').edgeType).toBe('retry');
    expect(byId('loop-back-edge').edgeType).toBe('loop-back');
    expect(byId('retry-attempt').edgeType).not.toBe(byId('loop-back-edge').edgeType);
    expect(report.persisted).toBe(false);
  });
});
