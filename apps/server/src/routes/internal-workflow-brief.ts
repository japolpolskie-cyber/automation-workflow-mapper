import type { FastifyPluginAsync } from 'fastify';
import type { WorkflowBriefService } from '../services/workflow-brief-service.js';

export function internalWorkflowBriefRoutes(service: WorkflowBriefService): FastifyPluginAsync {
  return async (app) => {
    app.post('/internal/workflow-brief/draft', async (request) => {
      const brief = service.generateDraft(request.body);
      return {
        success: true,
        data: {
          brief,
          detectionSummary: {
            candidateCount: brief.capabilitySuggestions.length,
            detectedFunctions: [...new Set(brief.capabilitySuggestions.map((item) => item.capabilityType))],
            clarificationCount: brief.clarificationQuestions.filter((item) => item.status === 'open').length,
          },
        },
        error: null,
        meta: { requestId: request.id, experimental: true },
      };
    });
  };
}

