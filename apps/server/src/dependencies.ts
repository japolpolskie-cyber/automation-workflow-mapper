import type { FastifyInstance } from "fastify";
import type { Environment } from "./config/environment.js";
import { DefaultHybridRAGService, type HybridRAGProvider, type HybridRAGService } from "./hybrid-rag/hybrid-rag-service.js";
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
  provider: HybridRAGProvider = new HybridRetrievalProvider(),
): Promise<ApplicationDependencies> {
  const hybridRAGService = new DefaultHybridRAGService(
    environment.HYBRID_RAG_MODE,
    provider,
  );
  try {
    await hybridRAGService.initialize();
  } catch {
    // Hybrid RAG initialization must never prevent the application from starting.
  }
  return { hybridRAGService };
}

export function registerApplicationDependencies(
  app: FastifyInstance,
  dependencies: ApplicationDependencies,
): void {
  app.decorate("dependencies", dependencies);
}
