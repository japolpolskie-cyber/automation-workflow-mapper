import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (request) => ({
    success: true, data: { status: 'ok', service: 'automation-workflow-mapper-api', timestamp: new Date().toISOString() },
    error: null, meta: { requestId: request.id }
  }));
};
