import type { FastifyPluginAsync } from 'fastify';
import type { PlatformService } from '../services/platform-service.js';

export function platformRoutes(service: PlatformService): FastifyPluginAsync {
  return async (app) => {
    app.post('/workflows/convert', async (request) => ({ success: true, data: service.convert(request.body), error: null, meta: { requestId: request.id } }));
    app.post('/workflows/validate', async (request) => ({ success: true, data: service.validate(request.body), error: null, meta: { requestId: request.id } }));
  };
}
