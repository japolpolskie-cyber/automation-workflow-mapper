import type { FastifyPluginAsync } from 'fastify';
import type { DocumentService } from '../services/document-service.js';

export function documentRoutes(service: DocumentService): FastifyPluginAsync {
  return async (app) => {
    app.post('/documents/extract', async (request, reply) => {
      const file = await request.file();
      if (!file) return reply.code(400).send({ success: false, data: null, error: { code: 'FILE_REQUIRED', message: 'Choose a document to extract.' }, meta: { requestId: request.id } });
      const buffer = await file.toBuffer();
      const document = await service.extract(file.filename, file.mimetype, buffer);
      return { success: true, data: document, error: null, meta: { requestId: request.id } };
    });
  };
}
