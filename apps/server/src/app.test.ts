import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const testEnvironment = { NODE_ENV: 'test', HOST: '127.0.0.1', PORT: 4000, DATABASE_PATH: ':memory:', CLIENT_ORIGIN: 'http://localhost:5173', LOG_LEVEL: 'silent', AI_PROVIDER: 'local', OPENAI_BASE_URL: 'https://api.openai.com/v1', OPENAI_MODEL: 'gpt-5.6-luna', OLLAMA_BASE_URL: 'http://127.0.0.1:11434', OLLAMA_MODELS: 'qwen3:8b,llama3.2:3b', K3_SCOPE_INTELLIGENCE: true, K3_KNOWLEDGE_BUDGET: 12_000, K4_PLANNER_SHADOW: true, K4_PLANNER_TIMEOUT_MS: 180_000, K4_PLANNER_MAX_OUTPUT_CHARS: 120_000, K4_PLANNER_MAX_RETRIES: 1, K4_PLANNER_CONTEXT_BUDGET: 24_000, P2_DISTRIBUTED_PLANNER: false, P2_DISTRIBUTED_PLANNER_TOTAL_TIMEOUT_MS: 300_000, P2_DISTRIBUTED_PLANNER_STAGE_TIMEOUT_MS: 60_000, P2_DISTRIBUTED_PLANNER_MAX_RETRIES: 1, P2_DISTRIBUTED_PLANNER_CONCURRENCY: 2, P2_DISTRIBUTED_PLANNER_CACHE: true, P3_DISTRIBUTED_PLANNER: false, P3_STAGE_A_TIMEOUT_MS: 180_000, P3_STAGE_B_TIMEOUT_MS: 240_000, P3_TOTAL_TIMEOUT_MS: 480_000, P3_STAGE_MAX_RETRIES: 1, P3_STAGE_MAX_OUTPUT_CHARS: 60_000, P3_CACHE_ENABLED: true, STAGE_C_NODE_GROUNDING: false, STAGE_C_MAX_CONCURRENCY: 4, STAGE_C_NODE_TIMEOUT_MS: 120_000, STAGE_C_MAX_RETRIES: 1, STAGE_C_CACHE_ENABLED: true, STAGE_C_MAX_OUTPUT_CHARS: 30_000, STAGE_D_EDGE_GROUNDING: false, STAGE_D_MAX_CONCURRENCY: 4, STAGE_D_EDGE_TIMEOUT_MS: 120_000, STAGE_D_MAX_RETRIES: 1, STAGE_D_CACHE_ENABLED: true, STAGE_D_MAX_OUTPUT_CHARS: 30_000 } as const;
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

describe('API foundation', () => {
  it('reports health with the response envelope', async () => {
    const app = await buildApp(testEnvironment);
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { status: 'ok' }, error: null });
  });

  it('creates and lists a project', async () => {
    const app = await buildApp(testEnvironment);
    apps.push(app);
    const created = await app.inject({ method: 'POST', url: '/api/workflows', payload: { name: 'Lead routing', clientName: 'Acme', description: '', platform: 'n8n' } });
    expect(created.statusCode).toBe(201);
    const listed = await app.inject({ method: 'GET', url: '/api/workflows' });
    expect(listed.json().data).toHaveLength(1);
  });

  it('extracts a text document through multipart upload', async () => {
    const app = await buildApp(testEnvironment);
    apps.push(app);
    const boundary = 'test-boundary';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="scope.txt"\r\nContent-Type: text/plain\r\n\r\nWhen a lead arrives, notify sales.\r\n--${boundary}--\r\n`;
    const response = await app.inject({ method: 'POST', url: '/api/documents/extract', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { fileType: 'txt', wordCount: 6 } });
  });

  it('persists an edited scope and creates a version', async () => {
    const app = await buildApp(testEnvironment);
    apps.push(app);
    const created = await app.inject({ method: 'POST', url: '/api/workflows', payload: { name: 'Scope test', platform: 'make' } });
    const id = created.json().data.id as string;
    const updated = await app.inject({ method: 'PATCH', url: `/api/workflows/${id}/scope`, payload: { originalScope: 'When an order arrives, validate it.' } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.originalScope).toBe('When an order arrives, validate it.');
  });

  it('analyzes a saved scope into a persisted canonical workflow', async () => {
    const app = await buildApp(testEnvironment); apps.push(app);
    const created = await app.inject({ method: 'POST', url: '/api/workflows', payload: { name: 'Order routing', platform: 'n8n' } });
    const id = created.json().data.id as string;
    await app.inject({ method: 'PATCH', url: `/api/workflows/${id}/scope`, payload: { originalScope: 'When a new Shopify order arrives, add it to Airtable. Then notify the team in Slack.' } });
    const analyzed = await app.inject({ method: 'POST', url: '/api/workflows/analyze', payload: { projectId: id } });
    expect(analyzed.statusCode).toBe(200);
    expect(analyzed.json()).toMatchObject({ success: true, data: { provider: 'local', graphValidation: { valid: true } } });
    const project = await app.inject({ method: 'GET', url: `/api/workflows/${id}` });
    const saved = project.json().data;
    expect(saved.workflow.nodes.length).toBeGreaterThan(1);
    expect(saved.visualGraph.nodes).toHaveLength(saved.workflow.nodes.length);
    expect(saved.workflowSet.workflows).toHaveLength(1);
    expect(saved.workflowSet.nodeReferences).toHaveLength(saved.workflow.nodes.length);

    const movedGraph = {
      ...saved.visualGraph,
      nodes: saved.visualGraph.nodes.map((node: { position: { x: number; y: number } }, index: number) => ({
        ...node,
        position: index === 0 ? { x: 321, y: 123 } : node.position
      }))
    };
    const edited = await app.inject({ method: 'PATCH', url: `/api/workflows/${id}/editor`, payload: { workflow: saved.workflow, visualGraph: movedGraph } });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().data.visualGraph.nodes[0].position).toEqual({ x: 321, y: 123 });

    const reloaded = await app.inject({ method: 'GET', url: `/api/workflows/${id}` });
    expect(reloaded.json().data.visualGraph.nodes[0].position).toEqual({ x: 321, y: 123 });

    const converted = await app.inject({ method: 'POST', url: '/api/workflows/convert', payload: { projectId: id, platform: 'zapier' } });
    expect(converted.statusCode).toBe(200);
    expect(converted.json().data).toMatchObject({ platform: 'zapier', platformName: 'Zapier', workflowName: saved.workflow.name });
    expect(converted.json().data.nodes).toHaveLength(saved.workflow.nodes.length);
    const validated = await app.inject({ method: 'POST', url: '/api/workflows/validate', payload: { projectId: id, platform: 'zapier' } });
    expect(validated.statusCode).toBe(200);
    expect(validated.json().data).toMatchObject({ statistics: { nodes: saved.workflow.nodes.length }, usageEstimate: expect.any(String), complexityScore: expect.any(Number) });
    const selectedNodeId = saved.workflow.nodes[1].id as string;
    const assisted = await app.inject({ method: 'POST', url: '/api/workflows/assist', payload: { projectId: id, command: 'Add an error handler after the selected node', workflow: saved.workflow, selectedNodeId } });
    expect(assisted.statusCode).toBe(200);
    expect(assisted.json().data).toMatchObject({ summary: '1 proposed workflow change.', changes: [{ type: 'add' }] });
    expect(assisted.json().data.proposedWorkflow.nodes).toHaveLength(saved.workflow.nodes.length + 1);
    const unchanged = await app.inject({ method: 'GET', url: `/api/workflows/${id}` });
    expect(unchanged.json().data.workflow.nodes).toHaveLength(saved.workflow.nodes.length);
  });

  it('wires consolidated planner feature flags without changing the persisted production workflow', async () => {
    const app = await buildApp({ ...testEnvironment, K4_PLANNER_SHADOW: false, P2_DISTRIBUTED_PLANNER: true });
    apps.push(app);
    const created = await app.inject({ method: 'POST', url: '/api/workflows', payload: { name: 'Planner flag test', platform: 'n8n' } });
    const id = created.json().data.id as string;
    await app.inject({ method: 'PATCH', url: `/api/workflows/${id}/scope`, payload: { originalScope: 'When an Asana task arrives, notify Slack.' } });
    const analyzed = await app.inject({ method: 'POST', url: '/api/workflows/analyze', payload: { projectId: id } });
    expect(analyzed.statusCode).toBe(200);
    expect(analyzed.json().data.plannerShadow).toMatchObject({ status: 'completed', groundedPlan: null });
    const persisted = (await app.inject({ method: 'GET', url: `/api/workflows/${id}` })).json().data;
    expect('plannerShadow' in persisted.workflow).toBe(false);
  });
});
