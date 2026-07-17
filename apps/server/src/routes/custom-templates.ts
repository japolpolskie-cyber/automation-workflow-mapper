import type { FastifyPluginAsync } from "fastify";
import type { CustomTemplateService } from "../services/custom-template-service.js";

export function customTemplateRoutes(
  service: CustomTemplateService,
): FastifyPluginAsync {
  return async (app) => {
    app.get("/custom-templates", async (request) => ({
      success: true,
      data: service.list(),
      error: null,
      meta: { requestId: request.id },
    }));
    app.post("/custom-templates", async (request, reply) =>
      reply.code(201).send({
        success: true,
        data: service.create(request.body),
        error: null,
        meta: { requestId: request.id },
      }),
    );
    app.patch<{ Params: { id: string } }>(
      "/custom-templates/:id",
      async (request, reply) => {
        const template = service.update(request.params.id, request.body);
        if (!template)
          return reply
            .code(404)
            .send({
              success: false,
              data: null,
              error: {
                code: "TEMPLATE_NOT_FOUND",
                message: "The custom template was not found.",
              },
              meta: { requestId: request.id },
            });
        return {
          success: true,
          data: template,
          error: null,
          meta: { requestId: request.id },
        };
      },
    );
    app.delete<{ Params: { id: string } }>(
      "/custom-templates/:id",
      async (request, reply) => {
        if (!service.delete(request.params.id))
          return reply
            .code(404)
            .send({
              success: false,
              data: null,
              error: {
                code: "TEMPLATE_NOT_FOUND",
                message: "The custom template was not found.",
              },
              meta: { requestId: request.id },
            });
        return {
          success: true,
          data: { deleted: true },
          error: null,
          meta: { requestId: request.id },
        };
      },
    );
    app.post<{ Params: { id: string } }>(
      "/custom-templates/:id/use",
      async (request, reply) => {
        const project = service.instantiate(request.params.id);
        if (!project)
          return reply
            .code(404)
            .send({
              success: false,
              data: null,
              error: {
                code: "TEMPLATE_NOT_FOUND",
                message: "The custom template was not found.",
              },
              meta: { requestId: request.id },
            });
        return reply
          .code(201)
          .send({
            success: true,
            data: project,
            error: null,
            meta: { requestId: request.id },
          });
      },
    );
  };
}
