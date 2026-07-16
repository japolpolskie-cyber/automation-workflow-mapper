import { afterEach, describe, expect, it } from 'vitest';
import { leadQualificationWorkflow } from '@awm/shared';
import type { AnalysisProvider, AnalysisProviderInput } from '../ai/providers/analysis-provider.js';
import { createDatabase, type Database } from '../database/database.js';
import { ProjectRepository } from '../repositories/project-repository.js';
import { AnalysisService } from './analysis-service.js';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';

const databases: Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function setup(provider: AnalysisProvider) {
  const database = createDatabase(':memory:'); databases.push(database);
  const repository = new ProjectRepository(database);
  const project = repository.create({ name: 'Schema test', clientName: '', description: '', platform: 'n8n' });
  repository.updateScope(project.id, 'When a lead arrives, notify sales.');
  return { project, service: new AnalysisService(repository, provider) };
}

describe('AnalysisService output boundary', () => {
  it('uses the free deterministic fallback when provider JSON cannot be repaired', async () => {
    const provider: AnalysisProvider = { name: 'openai', async analyze() { return 'not json'; }, async getStatus() { return { provider: 'openai', available: true, models: ['test'], message: 'ready' }; } };
    const { project, service } = setup(provider);
    const result = await service.analyze(project.id);
    expect(result.provider).toBe('local');
    expect(result.workflow.warnings.join(' ')).toMatch(/fallback used/i);
  });

  it('uses the free deterministic fallback when provider JSON violates the schema', async () => {
    const provider: AnalysisProvider = { name: 'openai', async analyze() { return '{"workflowName":"invented"}'; }, async getStatus() { return { provider: 'openai', available: true, models: ['test'], message: 'ready' }; } };
    const { project, service } = setup(provider);
    const result = await service.analyze(project.id);
    expect(result.provider).toBe('local');
    expect(result.graphValidation.valid).toBe(true);
  });

  it('keeps Qwen/provider input and generated workflow unchanged in K3 shadow mode', async () => {
    let received: AnalysisProviderInput | undefined;
    const provider: AnalysisProvider = { name: 'ollama', async analyze(input) { received = input; return structuredClone(leadQualificationWorkflow); }, async getStatus() { return { provider: 'ollama', available: true, models: ['qwen3:8b'], message: 'ready' }; } };
    const database = createDatabase(':memory:'); databases.push(database);
    const repository = new ProjectRepository(database);
    const project = repository.create({ name: 'Asana CRM', clientName: '', description: '', platform: 'n8n' });
    const scope = 'Use Asana and Gmail. Did the lead respond? Send a follow-up until response.';
    repository.updateScope(project.id, scope);
    const result = await new AnalysisService(repository, provider, undefined, new ScopeIntelligenceService()).analyze(project.id);
    expect(received).toEqual({ scope, projectName: 'Asana CRM', platform: 'n8n' });
    expect(result.detectedProcess?.shadowMode).toBe(true);
    const persisted = repository.findById(project.id)!;
    expect({ ...persisted.workflow, updatedAt: result.workflow.updatedAt }).toEqual(result.workflow);
    expect('detectedProcess' in result.workflow).toBe(false);
    expect('detectedProcess' in persisted).toBe(false);
  });

  it('removes K3 response metadata completely when the feature is disabled', async () => {
    const provider: AnalysisProvider = { name: 'ollama', async analyze() { return structuredClone(leadQualificationWorkflow); }, async getStatus() { return { provider: 'ollama', available: true, models: ['qwen3:8b'], message: 'ready' }; } };
    const { project, service } = setup(provider);
    const result = await service.analyze(project.id);
    expect(result.detectedProcess).toBeUndefined();
  });

  it('keeps the grounded plan non-persisted and outside the production provider input', async () => {
    let productionInput: AnalysisProviderInput | undefined; let groundedPrompt = '';
    const provider: AnalysisProvider = { name: 'ollama', async analyze(input) { productionInput = input; return structuredClone(leadQualificationWorkflow); }, async planGrounded(request) { groundedPrompt = request.user; const clarificationIds = [...new Set(request.user.match(/clarification-[a-z0-9-]+/g) ?? [])]; const factId = request.user.match(/fact-[a-z0-9-]+/)?.[0] ?? 'missing'; return { version: '1.1', objective: 'Plan the stated workflow.', platform: 'n8n', entryNodeId: 'step-1', nodes: [{ id: 'step-1', canonicalFunctionId: 'trigger', title: 'Receive lead', applicationRef: null, operationRef: null, inputs: [], outputs: ['lead'], factIds: [factId], patternIds: [], knowledgeIds: [], capabilityIds: [], blockedByClarificationIds: [], limitationAcknowledgements: [] }], edges: [], binaryConditions: [], routers: [], merges: [], loops: [], retries: [], blockedByClarificationIds: clarificationIds, warnings: [] }; }, async getStatus() { return { provider: 'ollama', available: true, models: ['qwen3:8b'], message: 'ready' }; } };
    const database = createDatabase(':memory:'); databases.push(database); const repository = new ProjectRepository(database);
    const project = repository.create({ name: 'Asana CRM', clientName: '', description: '', platform: 'n8n' }); const scope = 'When an Asana lead arrives, retrieve the task details.'; repository.updateScope(project.id, scope);
    const result = await new AnalysisService(repository, provider, undefined, new ScopeIntelligenceService()).analyze(project.id);
    expect(productionInput).toEqual({ scope, projectName: 'Asana CRM', platform: 'n8n' }); expect(result.plannerShadow?.status).toBe('completed');
    expect(groundedPrompt).not.toMatch(/"confidence"|"coverage"|"reliability"|"weight"/);
    const persisted = repository.findById(project.id)!; expect('plannerShadow' in persisted.workflow).toBe(false); expect('plannerShadow' in result.workflow).toBe(false);
  });
});
