import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { ZodError } from "zod";
import { DocumentProcessingError } from "./documents/document-errors.js";
import { LocalAnalysisProvider } from "./ai/providers/local-provider.js";
import { OpenAIAnalysisProvider } from "./ai/providers/openai-provider.js";
import { OllamaAnalysisProvider } from "./ai/providers/ollama-provider.js";
import type { Environment } from "./config/environment.js";
import { createDatabase } from "./database/database.js";
import { ProjectRepository } from "./repositories/project-repository.js";
import { documentRoutes } from "./routes/documents.js";
import { analysisRoutes } from "./routes/analysis.js";
import { healthRoutes } from "./routes/health.js";
import { projectRoutes } from "./routes/projects.js";
import { platformRoutes } from "./routes/platforms.js";
import { ProjectService } from "./services/project-service.js";
import { DocumentService } from "./services/document-service.js";
import { AnalysisError, AnalysisService } from "./services/analysis-service.js";
import { PlatformService } from "./services/platform-service.js";
import { AssistantService } from "./services/assistant-service.js";
import { assistantRoutes } from "./routes/assistant.js";
import { ScopeIntelligenceService } from "./analysis/scope-intelligence.js";
import { PlannerShadowService } from "./planner/planner-shadow-service.js";
import { P3ShadowExperimentService } from "./distributed-planner/p3-shadow-experiment.js";
import { ProviderPlannerStageRunnerFactory } from "./distributed-planner/provider-stage-runner.js";
import {
  selectPlannerRuntimeMode,
  UnifiedPlannerRuntime,
} from "./planner/planner-runtime-service.js";
import { P4DeterministicPlannerService } from "./planner/p4-deterministic-planner-service.js";
import { StageCGroundingService } from "./planner/stage-c-grounding-service.js";
import { StageDGroundingService } from "./planner/stage-d-grounding-service.js";
import { CustomTemplateRepository } from "./repositories/custom-template-repository.js";
import { CustomTemplateService } from "./services/custom-template-service.js";
import { customTemplateRoutes } from "./routes/custom-templates.js";
import { V2PromotionService } from "./planner/v2-promotion-service.js";
import {
  createApplicationDependencies,
  registerApplicationDependencies,
} from "./dependencies.js";

export async function buildApp(environment: Environment) {
  const app = Fastify({
    logger:
      environment.NODE_ENV === "test"
        ? false
        : { level: environment.LOG_LEVEL },
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 1_048_576,
  });
  registerApplicationDependencies(
    app,
    await createApplicationDependencies(environment),
  );
  await app.register(helmet);
  await app.register(cors, {
    origin: environment.CLIENT_ORIGIN,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: { files: 1, fileSize: 10 * 1024 * 1024, fields: 0 },
  });
  const database = createDatabase(environment.DATABASE_PATH);
  app.addHook("onClose", () => database.close());
  const service = new ProjectService(new ProjectRepository(database));
  const repository = new ProjectRepository(database);
  const customTemplateService = new CustomTemplateService(
    new CustomTemplateRepository(database),
    repository,
  );
  const provider =
    environment.AI_PROVIDER === "openai"
      ? new OpenAIAnalysisProvider({
          apiKey: environment.OPENAI_API_KEY ?? "",
          baseUrl: environment.OPENAI_BASE_URL,
          model: environment.OPENAI_MODEL,
        })
      : environment.AI_PROVIDER === "ollama"
        ? new OllamaAnalysisProvider({
            baseUrl: environment.OLLAMA_BASE_URL,
            models: environment.OLLAMA_MODELS.split(",")
              .map((model) => model.trim())
              .filter(Boolean),
          })
        : new LocalAnalysisProvider();
  await app.register(healthRoutes, { prefix: "/api" });
  await app.register(documentRoutes(new DocumentService()), { prefix: "/api" });
  const scopeIntelligence = environment.K3_SCOPE_INTELLIGENCE
    ? new ScopeIntelligenceService(environment.K3_KNOWLEDGE_BUDGET)
    : null;
  const runtimeMode = selectPlannerRuntimeMode(environment);
  const shadowRuntime = new PlannerShadowService(undefined, undefined, {
    timeoutMs: environment.K4_PLANNER_TIMEOUT_MS,
    maximumOutputCharacters: environment.K4_PLANNER_MAX_OUTPUT_CHARS,
    maximumRetries: environment.K4_PLANNER_MAX_RETRIES,
    contextBudget: environment.K4_PLANNER_CONTEXT_BUDGET,
  });
  const distributedRuntime = new P3ShadowExperimentService(
    {
      stageATimeoutMs: environment.P3_STAGE_A_TIMEOUT_MS,
      stageBTimeoutMs: environment.P3_STAGE_B_TIMEOUT_MS,
      totalTimeoutMs: environment.P3_TOTAL_TIMEOUT_MS,
      maximumRetries: environment.P3_STAGE_MAX_RETRIES,
      maximumOutputCharacters: environment.P3_STAGE_MAX_OUTPUT_CHARS,
      cacheEnabled:
        environment.P3_CACHE_ENABLED &&
        environment.P2_DISTRIBUTED_PLANNER_CACHE,
    },
    new ProviderPlannerStageRunnerFactory(provider),
  );
  const stageCGrounding = environment.STAGE_C_NODE_GROUNDING
    ? new StageCGroundingService({
        enabled: true,
        maximumConcurrency: environment.STAGE_C_MAX_CONCURRENCY,
        nodeTimeoutMs: environment.STAGE_C_NODE_TIMEOUT_MS,
        maximumRetries: environment.STAGE_C_MAX_RETRIES,
        cacheEnabled: environment.STAGE_C_CACHE_ENABLED,
        maximumOutputCharacters: environment.STAGE_C_MAX_OUTPUT_CHARS,
      })
    : null;
  const stageDGrounding = environment.STAGE_D_EDGE_GROUNDING
    ? new StageDGroundingService({
        enabled: true,
        maximumConcurrency: environment.STAGE_D_MAX_CONCURRENCY,
        edgeTimeoutMs: environment.STAGE_D_EDGE_TIMEOUT_MS,
        maximumRetries: environment.STAGE_D_MAX_RETRIES,
        cacheEnabled: environment.STAGE_D_CACHE_ENABLED,
        maximumOutputCharacters: environment.STAGE_D_MAX_OUTPUT_CHARS,
      })
    : null;
  const deterministicRuntime = new P4DeterministicPlannerService(
    new ProviderPlannerStageRunnerFactory(provider),
    undefined,
    undefined,
    stageCGrounding,
    stageDGrounding,
  );
  const promotion = new V2PromotionService(
    {
      mode: environment.PLANNER_V2_PROMOTION_MODE,
      allowPassWithWarnings: environment.PLANNER_V2_ALLOW_PASS_WITH_WARNINGS,
    },
    undefined,
    (decision) => app.log.info({
      promotionMode: decision.configuredMode,
      selectedSource: decision.authoritativeSource,
      gateResult: decision.failedGates.length ? "failed" : "passed",
      fallbackReason: decision.fallbackReason,
      selectedPlatform: decision.selectedPlatform,
      acceptanceResult: decision.acceptanceResult,
      elapsedMilliseconds: decision.timing.totalMilliseconds,
      requestCorrelationId: decision.requestCorrelationId,
    }, "Planner V2 promotion decision"),
  );
  await app.register(
    analysisRoutes(
      new AnalysisService(
        repository,
        provider,
        undefined,
        scopeIntelligence,
        new UnifiedPlannerRuntime(
          runtimeMode,
          shadowRuntime,
          distributedRuntime,
          deterministicRuntime,
        ),
        promotion,
      ),
    ),
    { prefix: "/api" },
  );
  await app.register(platformRoutes(new PlatformService(repository)), {
    prefix: "/api",
  });
  await app.register(assistantRoutes(new AssistantService(repository)), {
    prefix: "/api",
  });
  await app.register(projectRoutes(service), { prefix: "/api" });
  await app.register(customTemplateRoutes(customTemplateService), {
    prefix: "/api",
  });
  app.setNotFoundHandler((request, reply) =>
    reply
      .code(404)
      .send({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Route not found." },
        meta: { requestId: request.id },
      }),
  );
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "Request failed");
    const documentError = error instanceof DocumentProcessingError;
    const analysisError = error instanceof AnalysisError;
    const validation = error instanceof ZodError;
    const multipartError =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "FST_REQ_FILE_TOO_LARGE";
    const statusCode = analysisError
      ? error.statusCode
      : documentError
        ? error.statusCode
        : validation || multipartError
          ? 400
          : 500;
    const code = analysisError
      ? error.code
      : documentError
        ? error.code
        : multipartError
          ? "FILE_TOO_LARGE"
          : validation
            ? "VALIDATION_ERROR"
            : "INTERNAL_ERROR";
    const message = analysisError
      ? error.message
      : documentError
        ? error.message
        : multipartError
          ? "The file exceeds the 10 MB upload limit."
          : validation
            ? "The request was invalid."
            : "An unexpected error occurred.";
    return reply
      .code(statusCode)
      .send({
        success: false,
        data: null,
        error: { code, message },
        meta: { requestId: request.id },
      });
  });
  return app;
}
