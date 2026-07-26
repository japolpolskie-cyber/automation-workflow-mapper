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
  it('accepts the semantic customer-support fallback through final preparation and validation', async () => {
    const provider: AnalysisProvider = { name: 'ollama', async analyze() { return '{"connections":[{"connectionKind":"conditional"}]}'; }, async getStatus() { return { provider: 'ollama', available: true, models: ['qwen3:8b'], message: 'ready' }; } };
    const database = createDatabase(':memory:'); databases.push(database);
    const repository = new ProjectRepository(database);
    const project = repository.create({ name: 'Customer Support', clientName: '', description: '', platform: 'n8n' });
    repository.updateScope(project.id, `Create an n8n workflow for handling customer support requests.
The workflow should start when a customer submits a support form through a webhook.
Use an AI Agent to analyze the message, identify the department, determine urgency, and create a short summary.
The AI Agent should use:
- OpenAI Chat Model
- Simple Memory
- HTTP Request Tool
- Vector Store Tool
After the AI Agent, use a Router with three routes:
1. Sales
2. Technical Support
3. Billing
Each route should create a department-specific ticket.
Continue to an IF condition that checks whether the request is high priority:
If the request is high priority:
- Send an urgent Slack notification
If the request is not high priority:
- Log the request in Google Sheets
Finish successfully.
Do not count the AI Agent's Chat Model, Memory, and Tools as normal execution nodes.`);

    const result = await new AnalysisService(repository, provider).analyze(project.id);
    const nodeIds = new Set(result.workflow.nodes.map((node) => node.id));

    expect(result.provider).toBe('local');
    expect(result.graphValidation.valid).toBe(true);
    expect(result.workflow.connections.every((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId))).toBe(true);
    expect(result.workflow.nodes.filter((node) => /department ticket/i.test(node.name))).toHaveLength(3);
    expect(result.workflow.nodes.some((node) => node.category === 'merge')).toBe(true);
    expect(result.workflow.connections.filter((edge) => edge.branchLabel).map((edge) => edge.branchLabel)).toEqual(expect.arrayContaining(['TRUE', 'FALSE']));
    expect(result.workflow.connections.filter((edge) => edge.connectionKind && edge.connectionKind !== 'execution')).toHaveLength(4);
    expect(result.workflow.nodes.filter((node) => node.category === 'ai' && node.nodeKind !== 'ai-attachment')).toHaveLength(1);
    expect(result.workflow.nodes.map((node) => node.name).join(' ')).not.toMatch(/Wait the AI Agent|Wait the department ticket/i);
    const router = result.workflow.nodes.find((node) => node.category === 'router')!;
    const persisted = repository.findById(project.id)!;
    expect(result.workflow.connections.filter((edge) => edge.sourceNodeId === router.id).map((edge) => [edge.sourcePort, edge.label])).toEqual([
      ['route-1', 'Sales'],
      ['route-2', 'Technical Support'],
      ['route-3', 'Billing'],
    ]);
    expect(persisted.workflow.connections.filter((edge) => edge.sourceNodeId === router.id).map((edge) => [edge.sourcePort, edge.label])).toEqual([
      ['route-1', 'Sales'],
      ['route-2', 'Technical Support'],
      ['route-3', 'Billing'],
    ]);
  });

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

  it('rejects a two-node Ollama result for an explicit multi-step sequence', async () => {
    const candidate = structuredClone(leadQualificationWorkflow);
    const retained = new Set(candidate.nodes.slice(0, 2).map((node) => node.id));
    candidate.nodes = candidate.nodes.slice(0, 2);
    candidate.connections = candidate.connections.filter((edge) => retained.has(edge.sourceNodeId) && retained.has(edge.targetNodeId));
    candidate.branches = [];
    candidate.errorHandling = [];
    candidate.clarificationQuestions = [];
    candidate.risks = [];
    const provider: AnalysisProvider = { name: 'ollama', async analyze() { return candidate; }, async getStatus() { return { provider: 'ollama', available: true, models: ['qwen3:8b'], message: 'ready' }; } };
    const database = createDatabase(':memory:'); databases.push(database);
    const repository = new ProjectRepository(database);
    const project = repository.create({ name: 'Lead qualification', clientName: '', description: '', platform: 'n8n' });
    repository.updateScope(project.id, `Workflow Sequence
1. Webhook: Receive lead data
2. External API: Retrieve company details
3. Function: Score the lead
4. Database: Store the lead
5. Email: Notify sales
6. LLM: Generate outreach email

Required Integrations
- Webhook
- External API`);

    const result = await new AnalysisService(repository, provider).analyze(project.id);

    expect(result.provider).toBe('local');
    expect(result.workflow.nodes.filter((node) => !['start', 'end', 'note', 'group'].includes(node.category)).length).toBeGreaterThanOrEqual(6);
    expect(result.workflow.warnings.join(' ')).toMatch(/preserved only 2 of 6 explicit workflow steps/i);
  });

  it('uses deterministic conceptual analysis for a large multi-workflow portfolio', async () => {
    let providerCalled = false;
    const provider: AnalysisProvider = { name: 'ollama', async analyze() { providerCalled = true; throw new Error('Large portfolio should not be sent as one model request.'); }, async getStatus() { return { provider: 'ollama', available: true, models: ['qwen3:8b'], message: 'ready' }; } };
    const database = createDatabase(':memory:'); databases.push(database);
    const repository = new ProjectRepository(database);
    const project = repository.create({ name: 'Property operations', clientName: '', description: '', platform: 'make' });
    const section = (name: string, body: string) => `\n${name}\n\n${body}\n`;
    const scope = (`Property operations
${section('Inquiry Management', 'When an inquiry arrives, create a contact and notify Slack.')}
${section('Viewing Management', 'When a viewing is booked, create a calendar event and send an email.')}
${section('Maintenance Management', 'When a request arrives, create a task and notify the manager.')}
${section('Rent Collection', 'When rent is due, retrieve payment details and send a reminder.')}
${section('Owner Reporting', 'When reporting begins, retrieve each property and email the owner.')}`).padEnd(10_500, ' supporting operational detail');
    repository.updateScope(project.id, scope);

    const result = await new AnalysisService(repository, provider).analyze(project.id);
    const persisted = repository.findById(project.id)!;

    expect(providerCalled).toBe(false);
    expect(result.provider).toBe('local');
    expect(result.workflow.nodes.length).toBeGreaterThanOrEqual(4);
    expect(result.workflow.nodes.length).toBeLessThanOrEqual(10);
    expect(persisted.workflowSet.workflows).toHaveLength(1);
    expect(persisted.workflowSet.workflows.length).toBeLessThan(5);
    expect(result.workflow.nodes.some((node) => node.category === 'trigger' && node.name.includes('Leasing & Prospect Management'))).toBe(true);
    expect(result.workflow.nodes.some((node) => node.category === 'trigger' && node.name === 'Inquiry Management')).toBe(false);
    expect(result.workflow.warnings.join(' ')).toMatch(/large multi-workflow portfolio/i);
    expect(result.workflow.warnings.join(' ')).toMatch(/semantic compression reduced/i);
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
    const service = new AnalysisService(repository, provider, undefined, new ScopeIntelligenceService());
    const result = await service.analyze(project.id);
    expect(productionInput).toEqual({ scope, projectName: 'Asana CRM', platform: 'n8n' }); expect(result.plannerShadow?.status).toBe('completed');
    expect(result.v22ConceptualGraph).toMatchObject({ graph: { version: '2.2', shadowMode: true }, validation: { valid: true } });
    expect(result.v23PlatformTranslation).toMatchObject({ version: '2.3A', shadowMode: true, selectedPlatform: 'n8n' });
    expect(result.v24GraphCritique).toMatchObject({ conceptual: { version: '2.4A' }, platform: { platform: 'n8n' } });
    expect(result.v24GraphRepair).toMatchObject({ conceptual: { report: { version: '2.4B' } }, platform: { report: { platform: 'n8n' } } });
    expect(result.v25AcceptanceMatrix).toMatchObject({ version: '2.5', shadowMode: true });
    expect(result.processAnalysisDiagnostics).toMatchObject({
      version: '1.0',
      rulesVersion: '1.0',
      applicationsAndSystems: expect.arrayContaining(['Asana']),
    });
    expect(result.clarificationRecommendations).toEqual(expect.any(Array));
    expect(groundedPrompt).not.toMatch(/"confidence"|"coverage"|"reliability"|"weight"/);
    const recommendation = result.clarificationRecommendations![0]!;
    const withAnswers = await service.analyze(project.id, 'auto', null, [
      { recommendationId: recommendation.id, answerType: 'text', value: 'sensitive answer', sourceRecommendationCategory: recommendation.category },
      { recommendationId: 'process-clarification-unknown', answerType: 'text', value: 'unknown sensitive answer' },
    ]);
    expect(withAnswers.workflow.nodes.map((node) => ({
      name: node.name,
      category: node.category,
      service: node.service,
      operation: node.operation,
      description: node.description,
    }))).toEqual(
      result.workflow.nodes.map((node) => ({
        name: node.name,
        category: node.category,
        service: node.service,
        operation: node.operation,
        description: node.description,
      })),
    );
    expect(withAnswers.workflow.connections.map((connection) => ({
      label: connection.label,
      condition: connection.condition,
      connectionKind: connection.connectionKind,
    }))).toEqual(
      result.workflow.connections.map((connection) => ({
        label: connection.label,
        condition: connection.condition,
        connectionKind: connection.connectionKind,
      })),
    );
    expect(withAnswers.processAnalysisDiagnostics?.clarificationAnswerContext).toEqual({
      acceptedAnswerCount: 1,
      acceptedAnswerCategories: [recommendation.category],
    });
    expect(JSON.stringify(withAnswers.processAnalysisDiagnostics)).not.toContain('sensitive answer');
    expect(productionInput).toEqual({ scope, projectName: 'Asana CRM', platform: 'n8n' });
    const persisted = repository.findById(project.id)!; expect('plannerShadow' in persisted.workflow).toBe(false); expect('plannerShadow' in result.workflow).toBe(false);
    expect('v22ConceptualGraph' in persisted.workflow).toBe(false); expect('v22ConceptualGraph' in result.workflow).toBe(false);
    expect('v23PlatformTranslation' in persisted.workflow).toBe(false); expect('v23PlatformTranslation' in result.workflow).toBe(false);
    expect('v24GraphCritique' in persisted.workflow).toBe(false); expect('v24GraphCritique' in result.workflow).toBe(false);
    expect('v24GraphRepair' in persisted.workflow).toBe(false); expect('v24GraphRepair' in result.workflow).toBe(false);
    expect('v25AcceptanceMatrix' in persisted.workflow).toBe(false); expect('v25AcceptanceMatrix' in result.workflow).toBe(false);
  });
});
