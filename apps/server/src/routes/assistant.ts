import type { FastifyPluginAsync } from 'fastify';
import type { AssistantService } from '../services/assistant-service.js';
export function assistantRoutes(service: AssistantService): FastifyPluginAsync { return async (app) => { app.post('/workflows/assist', async (request) => ({ success: true, data: service.propose(request.body), error: null, meta: { requestId: request.id } })); }; }
