import Fastify from 'fastify';
import { ZodError } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { internalWorkflowBriefRoutes } from './internal-workflow-brief.js';
import { WorkflowBriefService } from '../services/workflow-brief-service.js';

const apps: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function testApp(service: WorkflowBriefService = new WorkflowBriefService()) {
  const app = Fastify({ logger: false });
  apps.push(app);
  app.setErrorHandler((error, request, reply) => reply.code(error instanceof ZodError ? 400 : 500).send({
    success: false,
    data: null,
    error: { code: error instanceof ZodError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message: 'The request was invalid.' },
    meta: { requestId: request.id },
  }));
  await app.register(internalWorkflowBriefRoutes(service), { prefix: '/api' });
  return app;
}

describe('internal Workflow Brief endpoint', () => {
  it('returns a brief and detection summary for a valid POST', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/workflow-brief/draft',
      payload: { sourceRequirement: 'Route requests to IT, Marketing, or Customer Support.' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        brief: { reviewState: { status: 'draft' } },
        detectionSummary: { candidateCount: 1, detectedFunctions: ['multi-route-decision'], clarificationCount: 0 },
      },
      error: null,
      meta: { experimental: true },
    });
  });

  it('rejects an empty source requirement', async () => {
    const app = await testApp();
    const response = await app.inject({ method: 'POST', url: '/api/internal/workflow-brief/draft', payload: { sourceRequirement: ' ' } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns Wait and Approval in the backward-compatible detection summary', async () => {
    const app = await testApp();
    const wait = await app.inject({ method: 'POST', url: '/api/internal/workflow-brief/draft', payload: { sourceRequirement: 'Wait until the customer replies.' } });
    const approval = await app.inject({ method: 'POST', url: '/api/internal/workflow-brief/draft', payload: { sourceRequirement: 'Send the proposal to the manager for approval.' } });
    expect(wait.json().data.detectionSummary).toMatchObject({ candidateCount: 1, detectedFunctions: ['wait'] });
    expect(approval.json().data.detectionSummary).toMatchObject({ candidateCount: 1, detectedFunctions: ['approval'] });
  });

  it('calls only the isolated service supplied to the route', async () => {
    const generateDraft = vi.fn((input: unknown) => new WorkflowBriefService().generateDraft(input));
    const app = await testApp({ generateDraft } as WorkflowBriefService);
    await app.inject({ method: 'POST', url: '/api/internal/workflow-brief/draft', payload: { sourceRequirement: 'Review the requirement.' } });
    expect(generateDraft).toHaveBeenCalledOnce();
  });

  it('does not alter unrelated route behavior', async () => {
    const app = await testApp();
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(404);
  });
});
