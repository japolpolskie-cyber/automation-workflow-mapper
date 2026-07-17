import { afterEach, describe, expect, it } from 'vitest';
import { leadQualificationWorkflow } from '@awm/shared';
import type { AnalysisProvider, AnalysisProviderInput } from '../ai/providers/analysis-provider.js';
import { createDatabase, type Database } from '../database/database.js';
import { ProjectRepository } from '../repositories/project-repository.js';
import { AnalysisService } from './analysis-service.js';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { LocalAnalysisProvider } from '../ai/providers/local-provider.js';

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
  it('accepts Ollama output with exactly one valid trigger', async () => {
    const provider: AnalysisProvider = { name: 'ollama', async analyze() { return structuredClone(leadQualificationWorkflow); }, async getStatus() { return { provider: 'ollama', available: true, models: ['qwen3:8b'], message: 'ready' }; } };
    const { project, service } = setup(provider);

    const result = await service.analyze(project.id);

    expect(result.provider).toBe('ollama');
    expect(result.workflow.nodes.filter((node) => ['trigger', 'start'].includes(node.category))).toHaveLength(1);
  });

  it('adds one canonical Start when an otherwise valid Ollama graph omits its entry point', async () => {
    const candidate = structuredClone(leadQualificationWorkflow);
    const trigger = candidate.nodes.find((node) => node.category === 'trigger')!;
    trigger.category = 'action'; trigger.service = null; trigger.operation = 'Prepare workflow input';
    const provider: AnalysisProvider = { name: 'ollama', async analyze() { return candidate; }, async getStatus() { return { provider: 'ollama', available: true, models: ['qwen3:8b'], message: 'ready' }; } };
    const { project, service } = setup(provider);

    const result = await service.analyze(project.id);

    const entries = result.workflow.nodes.filter((node) => ['trigger', 'start'].includes(node.category));
    expect(result.provider).toBe('ollama');
    expect(entries).toEqual([expect.objectContaining({ category: 'start', name: 'Workflow Start', service: null })]);
    expect(result.workflow.warnings.join(' ')).toMatch(/platform-neutral Start node was added/i);
    expect(result.graphValidation.valid).toBe(true);
  });

  it('falls back locally when Ollama returns multiple entry points', async () => {
    const candidate = structuredClone(leadQualificationWorkflow);
    candidate.nodes.push({ ...structuredClone(candidate.nodes.find((node) => node.category === 'trigger')!), id: crypto.randomUUID(), name: 'Unsupported second entry' });
    const provider: AnalysisProvider = { name: 'ollama', async analyze() { return candidate; }, async getStatus() { return { provider: 'ollama', available: true, models: ['qwen3:8b'], message: 'ready' }; } };
    const { project, service } = setup(provider);

    const result = await service.analyze(project.id);

    expect(result.provider).toBe('local');
    expect(result.workflow.nodes.filter((node) => ['trigger', 'start'].includes(node.category))).toHaveLength(1);
  });

  it('falls back locally when an Ollama graph has unrecoverable references', async () => {
    const candidate = structuredClone(leadQualificationWorkflow);
    candidate.connections[0]!.sourceNodeId = crypto.randomUUID();
    const provider: AnalysisProvider = { name: 'ollama', async analyze() { return candidate; }, async getStatus() { return { provider: 'ollama', available: true, models: ['qwen3:8b'], message: 'ready' }; } };
    const { project, service } = setup(provider);

    const result = await service.analyze(project.id);

    expect(result.provider).toBe('local');
    expect(result.graphValidation.valid).toBe(true);
  });

  it('preserves a detailed multiline graph through analysis, persistence, and reload', async () => {
    const database = createDatabase(':memory:'); databases.push(database);
    const repository = new ProjectRepository(database);
    const project = repository.create({ name: 'Lead response', clientName: '', description: '', platform: 'n8n' });
    const scope = `When a new lead enters the CRM, validate the email address.

If valid, assign the lead to a salesperson and send a welcome email.

If invalid, notify the sales manager and move the lead to manual review.

After three days, check whether the lead replied.

If there is no reply, send a follow-up message.`;
    repository.updateScope(project.id, scope);

    const result = await new AnalysisService(repository, new LocalAnalysisProvider(), undefined, new ScopeIntelligenceService()).analyze(project.id);
    const reloaded = repository.findById(project.id)!;

    // The provider's twelve process nodes plus the canonical architecture start node.
    expect(result.workflow.nodes).toHaveLength(13);
    expect(result.workflow.branches).toHaveLength(4);
    expect(reloaded.originalScope).toBe(scope);
    expect(reloaded.workflow.nodes).toHaveLength(result.workflow.nodes.length);
    expect(reloaded.workflow.branches).toHaveLength(result.workflow.branches.length);
    expect(reloaded.workflowSet.nodeReferences).toHaveLength(result.workflow.nodes.length);
    expect(reloaded.visualGraph.nodes).toHaveLength(result.workflow.nodes.length);
    expect(reloaded.visualGraph.edges).toHaveLength(result.workflow.connections.length);
  });

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
