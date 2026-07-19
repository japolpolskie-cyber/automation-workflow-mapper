import { analyzeWorkflowRequestSchema } from '@awm/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { AnalysisService } from '../services/analysis-service.js';

export function analysisRoutes(service: AnalysisService): FastifyPluginAsync {
  return async (app) => {
    app.get('/ai/status', async (request) => ({ success: true, data: await service.getProviderStatus(), error: null, meta: { requestId: request.id } }));
    app.post('/workflows/analyze', async (request) => {
      const input = analyzeWorkflowRequestSchema.parse(request.body);
      return { success: true, data: await service.analyze(input.projectId, input.workflowMode, request.id), error: null, meta: { requestId: request.id } };
    });
  };
}
