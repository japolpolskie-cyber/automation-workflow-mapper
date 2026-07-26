import { analyzeWorkflowRequestSchema } from '@awm/shared';
import type { FastifyPluginAsync } from 'fastify';
import { AnalysisError, type AnalysisService } from '../services/analysis-service.js';

export function analysisRoutes(service: AnalysisService): FastifyPluginAsync {
  return async (app) => {
    app.get('/ai/status', async (request) => ({ success: true, data: await service.getProviderStatus(), error: null, meta: { requestId: request.id } }));
    app.post('/workflows/analyze', async (request) => {
      const parsed = analyzeWorkflowRequestSchema.safeParse(request.body);
      if (!parsed.success) throw new AnalysisError('VALIDATION_ERROR', 'The request was invalid.', 400);
      const input = parsed.data;
      return { success: true, data: await service.analyze(input.projectId, input.workflowMode, request.id, input.clarificationAnswers), error: null, meta: { requestId: request.id } };
    });
  };
}
