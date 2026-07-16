import { describe, expect, it } from 'vitest';
import {
  businessIntentInputSchema, businessIntentOutputSchema, deterministicAssemblyInputSchema, deterministicAssemblyOutputSchema,
  deterministicValidationInputSchema, deterministicValidationOutputSchema, distributedPlannerContractVersion,
  edgeGroundingInputSchema, edgeGroundingOutputSchema, nodeGroundingInputSchema, nodeGroundingOutputSchema,
  workflowSkeletonInputSchema, workflowSkeletonOutputSchema,
} from '@awm/shared';
import { DistributedPlannerOrchestrator, DistributedStageError, type DistributedStageDefinition, type ModelNeutralStageRunner } from './distributed-planner-orchestrator.js';
import { contentHash } from './stage-cache.js';

const scope = 'When an Asana lead moves to Ready, create a Google Drive folder and create the required Asana subtask.';
const context = { rawScope: scope, normalizedScopeHash: contentHash(scope), platform: 'n8n' as const, detectorVersion: '1.1.0', catalogVersion: '1.0.0' };
const calls: string[] = [];
const mock = (id: string, implementation: ModelNeutralStageRunner['run']): ModelNeutralStageRunner => ({ runnerId: `mock.${id}`, modelId: null, async run(input, runnerContext) { calls.push(`${id}:${runnerContext.attempt + 1}`); return implementation(input, runnerContext); } });
const base = (value: Omit<DistributedStageDefinition, 'contractVersion' | 'version' | 'inputContractVersion' | 'enabled' | 'timeoutMs' | 'retryPolicy' | 'cachePolicy'> & Partial<Pick<DistributedStageDefinition, 'retryPolicy'>>): DistributedStageDefinition => ({
  contractVersion: distributedPlannerContractVersion, version: '1.0.0', inputContractVersion: '1.0.0', enabled: true, timeoutMs: 1_000,
  retryPolicy: value.retryPolicy ?? { maximumRetries: 0, retryableCategories: [] }, cachePolicy: { enabled: true }, ...value,
});

describe('P2 Asana CRM deterministic orchestration benchmark', () => {
  it('retries only one grounding task, reuses upstream artifacts, waits for dependencies, and persists nothing', async () => {
    calls.length = 0; let folderGroundingAttempts = 0;
    const orchestrator = new DistributedPlannerOrchestrator({ totalTimeoutMs: 5_000, maximumConcurrency: 2, cacheEnabled: true });
    orchestrator.register(base({
      instanceId: 'intent', stageId: 'business-intent', dependencies: [], inputSchema: businessIntentInputSchema, outputSchema: businessIntentOutputSchema,
      buildInput: () => ({ runId: 'benchmark', rawScope: scope, platform: 'n8n', facts: [], clarifications: [], relevantKnowledge: [{ id: 'asana', kind: 'application' }, { id: 'google-drive', kind: 'application' }] }),
      runner: mock('intent', async () => ({ businessObjective: 'Prepare a ready Asana lead', actors: ['sales'], systems: ['Asana', 'Google Drive'], businessOutcomes: ['Client folder and subtask exist'], constraints: [], unresolvedQuestions: [], decompositionHints: ['Trigger, folder, subtask'], factIds: [], knowledgeIds: ['asana', 'google-drive'] })),
    }));
    const skeleton = {
      boundary: { entryKey: 'trigger', exitKeys: ['subtask'] },
      nodes: [
        { key: 'trigger', canonicalFunctionId: 'trigger', title: 'Lead ready', blockedByClarificationIds: [] },
        { key: 'folder', canonicalFunctionId: 'action', title: 'Create client folder', blockedByClarificationIds: [] },
        { key: 'subtask', canonicalFunctionId: 'action', title: 'Create Asana subtask', blockedByClarificationIds: [] },
      ],
      edges: [{ key: 'e1', sourceKey: 'trigger', targetKey: 'folder', semanticLabel: 'NEXT' }, { key: 'e2', sourceKey: 'folder', targetKey: 'subtask', semanticLabel: 'NEXT' }],
      binaryConditions: [], routers: [], loops: [], merges: [], blockingClarificationIds: [],
    };
    orchestrator.register(base({
      instanceId: 'skeleton', stageId: 'workflow-skeleton', dependencies: ['intent'], dependencyVersions: { intent: '1.0.0' }, inputSchema: workflowSkeletonInputSchema, outputSchema: workflowSkeletonOutputSchema,
      buildInput: (_ctx, upstream) => ({ runId: 'benchmark', platform: 'n8n', intent: upstream.get('intent'), patternIds: [], requiredCanonicalFunctions: ['trigger', 'action'] }),
      runner: mock('skeleton', async () => skeleton),
    }));
    const grounded = {
      trigger: { nodeKey: 'trigger', canonicalFunctionId: 'trigger', applicationRef: 'asana', operationRef: 'asana.task-moved-to-section', inputs: ['section'], outputs: ['taskId'], factIds: [], patternIds: [], knowledgeIds: ['asana.task-moved-to-section'], capabilityIds: ['n8n.trigger'], blockedByClarificationIds: [], limitations: [], alternatives: [] },
      folder: { nodeKey: 'folder', canonicalFunctionId: 'action', applicationRef: 'google-drive', operationRef: 'google-drive.create-folder', inputs: ['name'], outputs: ['folderId'], factIds: [], patternIds: [], knowledgeIds: ['google-drive.create-folder'], capabilityIds: ['n8n.action'], blockedByClarificationIds: [], limitations: [], alternatives: [] },
      subtask: { nodeKey: 'subtask', canonicalFunctionId: 'action', applicationRef: 'asana', operationRef: 'asana.create-subtask', inputs: ['taskId'], outputs: ['subtaskId'], factIds: [], patternIds: [], knowledgeIds: ['asana.create-subtask'], capabilityIds: ['n8n.action'], blockedByClarificationIds: [], limitations: [], alternatives: [] },
    };
    for (const key of ['trigger', 'folder', 'subtask'] as const) orchestrator.register(base({
      instanceId: `ground-${key}`, stageId: 'node-grounding', dependencies: ['skeleton'], parallelGroup: 'node-grounding', inputSchema: nodeGroundingInputSchema, outputSchema: nodeGroundingOutputSchema,
      buildInput: (_ctx, upstream) => ({ runId: 'benchmark', platform: 'n8n', node: (upstream.get('skeleton') as typeof skeleton).nodes.find((node) => node.key === key), predecessorKeys: [], successorKeys: [], allowedApplicationIds: ['asana', 'google-drive'], allowedOperationIds: ['asana.task-moved-to-section', 'google-drive.create-folder', 'asana.create-subtask'], allowedCanonicalFunctionIds: ['trigger', 'action'], factIds: [], patternIds: [], knowledgeIds: [], capabilityIds: [] }),
      runner: mock(`ground-${key}`, async () => { if (key === 'folder' && ++folderGroundingAttempts === 1) throw new DistributedStageError('malformed-model-output', 'Simulated malformed grounding.', true); return grounded[key]; }),
      retryPolicy: key === 'folder' ? { maximumRetries: 1, retryableCategories: ['malformed-model-output'] } : { maximumRetries: 0, retryableCategories: [] },
    }));
    const groundedEdges = {
      e1: { edgeKey: 'e1', sourceKey: 'trigger', targetKey: 'folder', sourceHandle: null, targetHandle: null, label: 'NEXT', condition: null, purpose: 'Create the client folder after qualification.', businessReason: 'Ready leads require a folder.', ruleId: 'benchmark.sequence', evidenceIds: ['scope-1'] },
      e2: { edgeKey: 'e2', sourceKey: 'folder', targetKey: 'subtask', sourceHandle: null, targetHandle: null, label: 'NEXT', condition: null, purpose: 'Create the subtask after the folder.', businessReason: 'The subtask follows folder preparation.', ruleId: 'benchmark.sequence', evidenceIds: ['scope-1'] },
    };
    for (const edge of skeleton.edges) orchestrator.register(base({
      instanceId: `edge-${edge.key}`, stageId: 'edge-grounding', dependencies: ['skeleton', `ground-${edge.sourceKey}`, `ground-${edge.targetKey}`], parallelGroup: 'edge-grounding', inputSchema: edgeGroundingInputSchema, outputSchema: edgeGroundingOutputSchema,
      buildInput: (_ctx, upstream) => ({ runId: 'benchmark', platform: 'n8n', edge, sourceNode: upstream.get(`ground-${edge.sourceKey}`), targetNode: upstream.get(`ground-${edge.targetKey}`), decisionFactIds: [], evidenceIds: ['scope-1'], patternIds: [] }),
      runner: mock(`edge-${edge.key}`, async () => groundedEdges[edge.key as keyof typeof groundedEdges]),
    }));
    const graph = {
      version: '1.1' as const, objective: scope, platform: 'n8n' as const, entryNodeId: 'trigger',
      nodes: Object.values(grounded).map((node) => ({ id: node.nodeKey, canonicalFunctionId: node.canonicalFunctionId, title: skeleton.nodes.find((item) => item.key === node.nodeKey)!.title, applicationRef: node.applicationRef, operationRef: node.operationRef, inputs: node.inputs, outputs: node.outputs, factIds: node.factIds, patternIds: node.patternIds, knowledgeIds: node.knowledgeIds, capabilityIds: node.capabilityIds, blockedByClarificationIds: node.blockedByClarificationIds, limitationAcknowledgements: node.limitations })),
      edges: Object.values(groundedEdges).map((edge) => ({ id: edge.edgeKey, source: edge.sourceKey, target: edge.targetKey, condition: edge.condition, label: edge.label, purpose: edge.purpose, businessReason: edge.businessReason, ruleId: edge.ruleId, evidenceIds: edge.evidenceIds })),
      binaryConditions: [], routers: [], merges: [], loops: [], retries: [], blockedByClarificationIds: [], warnings: [],
    };
    const assemblyDependencies = ['skeleton', 'ground-trigger', 'ground-folder', 'ground-subtask', 'edge-e1', 'edge-e2'];
    orchestrator.register(base({
      instanceId: 'assembly', stageId: 'deterministic-assembly', dependencies: assemblyDependencies, inputSchema: deterministicAssemblyInputSchema, outputSchema: deterministicAssemblyOutputSchema,
      buildInput: (_ctx, upstream) => ({ runId: 'benchmark', objective: scope, platform: 'n8n', skeleton: upstream.get('skeleton'), groundedNodes: ['ground-trigger', 'ground-folder', 'ground-subtask'].map((id) => upstream.get(id)), groundedEdges: ['edge-e1', 'edge-e2'].map((id) => upstream.get(id)), blockingClarificationIds: [] }),
      runner: mock('assembly', async () => ({ graph })),
      finalGraph: (output) => (output as { graph: typeof graph }).graph,
    }));
    orchestrator.register(base({
      instanceId: 'validation', stageId: 'deterministic-validation', dependencies: ['assembly'], inputSchema: deterministicValidationInputSchema, outputSchema: deterministicValidationOutputSchema,
      buildInput: (_ctx, upstream) => upstream.get('assembly'),
      runner: mock('validation', async (input) => ({ valid: true, issueCodes: [], graph: (input as { graph: typeof graph }).graph })),
      finalGraph: (output) => (output as { graph: typeof graph }).graph,
    }));

    const report = await orchestrator.run(context);
    expect(report.status).toBe('completed'); expect(report.finalGraph?.version).toBe('1.1'); expect(report.persisted).toBe(false);
    expect(calls.filter((item) => item.startsWith('intent:'))).toHaveLength(1); expect(calls.filter((item) => item.startsWith('skeleton:'))).toHaveLength(1);
    expect(calls.filter((item) => item.startsWith('ground-folder:'))).toEqual(['ground-folder:1', 'ground-folder:2']);
    expect(report.stages.find((item) => item.stageInstanceId === 'ground-folder')?.attempts).toBe(2);
    expect(calls.indexOf('assembly:1')).toBeGreaterThan(calls.indexOf('edge-e2:1'));
    expect(report.stages.every((item) => item.transitions.length > 0 && item.failure === null)).toBe(true);
  });
});
