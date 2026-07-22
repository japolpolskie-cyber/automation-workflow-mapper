import type { FastifyInstance } from "fastify";
import type { Environment } from "./config/environment.js";
import { DefaultHybridRAGService, type HybridRAGService } from "./hybrid-rag/hybrid-rag-service.js";
import { HybridRetrievalProvider } from "./hybrid-rag/hybrid-retrieval-provider.js";

export interface ApplicationDependencies {
  hybridRAGService: HybridRAGService;
}

declare module "fastify" {
  interface FastifyInstance {
    dependencies: ApplicationDependencies;
  }
}

export async function createApplicationDependencies(
  environment: Pick<Environment, "HYBRID_RAG_MODE">,
): Promise<ApplicationDependencies> {
  const hybridRAGService = new DefaultHybridRAGService(
    environment.HYBRID_RAG_MODE,
    new HybridRetrievalProvider(),
  );
  await hybridRAGService.initialize();
  return { hybridRAGService };
}

export function registerApplicationDependencies(
  app: FastifyInstance,
  dependencies: ApplicationDependencies,
): void {
  app.decorate("dependencies", dependencies);
}
