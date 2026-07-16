import { describe, expect, it } from 'vitest';
import { leadQualificationWorkflow } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import type { AnalysisProvider } from '../ai/providers/analysis-provider.js';
import { PlannerShadowService } from './planner-shadow-service.js';

const scope = 'When an Asana task changes, retrieve the task details.';
const analysis = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-16T00:00:00.000Z'));
const factId = analysis.facts.find((item) => item.kind === 'application')!.id;
const evidenceId = analysis.facts.find((item) => item.id === factId)!.evidence[0]!.id;
const plan = {
  version: '1.1', objective: scope, platform: 'n8n', entryNodeId: 'trigger-1',
  nodes: [
    { id: 'trigger-1', canonicalFunctionId: 'trigger', title: 'Asana task changed', applicationRef: 'asana', operationRef: 'asana.task-moved-to-section', inputs: [], outputs: ['taskId'], factIds: [factId], patternIds: [], knowledgeIds: ['asana.task-moved-to-section'], capabilityIds: ['n8n.trigger'], blockedByClarificationIds: [], limitationAcknowledgements: ['Exact trigger availability depends on the connector version.'] },
    { id: 'retrieve-1', canonicalFunctionId: 'data-retrieval', title: 'Retrieve task details', applicationRef: 'asana', operationRef: 'asana.get-task-details', inputs: ['taskId'], outputs: ['task'], factIds: [factId], patternIds: [], knowledgeIds: ['asana.get-task-details'], capabilityIds: ['n8n.data-retrieval'], blockedByClarificationIds: [], limitationAcknowledgements: [] },
  ],
  edges: [{ id: 'edge-1', source: 'trigger-1', target: 'retrieve-1', condition: null, label: 'NEXT', purpose: 'Load complete task data.', businessReason: 'Downstream work needs full task details.', ruleId: 'sequence.task-details', evidenceIds: [evidenceId] }],
  binaryConditions: [], routers: [], merges: [], loops: [], retries: [], blockedByClarificationIds: analysis.clarifications.map((item) => item.id), warnings: [],
};

describe('K4.1 shadow comparison', () => {
  it('returns a validated execution graph without changing the current workflow', async () => {
    const before = structuredClone(leadQualificationWorkflow); let request = '';
    const provider: AnalysisProvider = { name: 'ollama', async analyze() { return before; }, async planGrounded(input) { request = input.user; return plan; }, async getStatus() { return { provider: 'ollama', available: true, models: ['qwen3:8b'], message: 'ready' }; } };
    const comparison = await new PlannerShadowService().compare(provider, scope, 'n8n', analysis, before);
    expect(comparison.status).toBe('completed'); expect(comparison.groundedPlan?.nodes).toHaveLength(2); expect(comparison.groundedPlan?.edges).toHaveLength(1); expect(before).toEqual(leadQualificationWorkflow);
    expect(request).not.toMatch(/"confidence"|"coverage"|"reliability"|"weight"/);
  });

  it('rejects invented references and dangling graph structure', async () => {
    const provider: AnalysisProvider = { name: 'ollama', async analyze() { return leadQualificationWorkflow; }, async planGrounded() { return { ...plan, nodes: [{ ...plan.nodes[0], operationRef: 'invented.magic' }], edges: [{ ...plan.edges[0], target: 'missing' }] }; }, async getStatus() { return { provider: 'ollama', available: true, models: [], message: '' }; } };
    const comparison = await new PlannerShadowService().compare(provider, scope, 'n8n', analysis, leadQualificationWorkflow);
    expect(comparison.status).toBe('failed'); expect(comparison.error).toMatch(/unsupported operations|invalid/i);
  });
});
