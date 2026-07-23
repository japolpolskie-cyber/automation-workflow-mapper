import { createProjectSchema } from '@awm/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { ProjectService } from '../services/project-service.js';

export function projectRoutes(service: ProjectService): FastifyPluginAsync {
  return async (app) => {
    app.get('/workflows', async (request) => ({ success: true, data: service.listProjects(), error: null, meta: { requestId: request.id } }));
    app.get('/workflows/archived', async (request) => ({ success: true, data: service.listArchivedProjects(), error: null, meta: { requestId: request.id } }));
    app.get<{ Params: { id: string } }>('/workflows/:id', async (request, reply) => {
      const project = service.getProject(request.params.id);
      if (!project) return reply.code(404).send({ success: false, data: null, error: { code: 'PROJECT_NOT_FOUND', message: 'The workflow project was not found.' }, meta: { requestId: request.id } });
      return { success: true, data: project, error: null, meta: { requestId: request.id } };
    });
    app.post('/workflows', async (request, reply) => {
      const result = createProjectSchema.safeParse(request.body);
      if (!result.success) return reply.code(400).send({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Project details are invalid.', details: result.error.flatten() }, meta: { requestId: request.id } });
      return reply.code(201).send({ success: true, data: service.createProject(result.data), error: null, meta: { requestId: request.id } });
    });
    app.patch<{ Params: { id: string } }>('/workflows/:id/scope', async (request, reply) => {
      const project = service.updateScope(request.params.id, request.body);
      if (!project) return reply.code(404).send({ success: false, data: null, error: { code: 'PROJECT_NOT_FOUND', message: 'The workflow project was not found.' }, meta: { requestId: request.id } });
      return { success: true, data: project, error: null, meta: { requestId: request.id } };
    });
    app.patch<{ Params: { id: string } }>('/workflows/:id/archive', async (request, reply) => {
      const project = service.archiveProject(request.params.id);
      if (!project) return reply.code(404).send({ success: false, data: null, error: { code: 'PROJECT_NOT_FOUND', message: 'The workflow project was not found.' }, meta: { requestId: request.id } });
      return { success: true, data: project, error: null, meta: { requestId: request.id } };
    });
    app.patch<{ Params: { id: string } }>('/workflows/:id/restore', async (request, reply) => {
      const project = service.restoreProject(request.params.id);
      if (!project) return reply.code(404).send({ success: false, data: null, error: { code: 'PROJECT_NOT_FOUND', message: 'The workflow project was not found.' }, meta: { requestId: request.id } });
      return { success: true, data: project, error: null, meta: { requestId: request.id } };
    });
    app.delete<{ Params: { id: string } }>('/workflows/:id', async (request, reply) => {
      const project = service.deleteProject(request.params.id);
      if (!project) return reply.code(404).send({ success: false, data: null, error: { code: 'PROJECT_NOT_FOUND', message: 'The workflow project was not found.' }, meta: { requestId: request.id } });
      return { success: true, data: project, error: null, meta: { requestId: request.id } };
    });
    app.patch<{ Params: { id: string } }>('/workflows/:id/editor', async (request, reply) => {
      const project = service.updateEditor(request.params.id, request.body);
      if (!project) return reply.code(404).send({ success: false, data: null, error: { code: 'PROJECT_NOT_FOUND', message: 'The workflow project was not found.' }, meta: { requestId: request.id } });
      return { success: true, data: project, error: null, meta: { requestId: request.id } };
    });
  };
}
