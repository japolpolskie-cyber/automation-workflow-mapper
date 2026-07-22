import type {
  DetectedProcessSummary,
  PlannerRetrievalContext,
  Platform,
} from "@awm/shared";
import type { HybridRAGMode } from "./contracts.js";
import type { HybridRAGService } from "./hybrid-rag-service.js";
import { adaptPlannerRetrievalRequest } from "./planner-retrieval-adapter.js";
import {
  buildPlannerRetrievalContext,
  type PlannerRetrievalLimits,
} from "./planner-retrieval-context.js";

export interface PlannerRAGDiagnostics {
  retrievalAttempted: boolean;
  retrievalUsed: boolean;
  fallbackReason: string | null;
  selectedStrategy: "hybrid";
  suppliedChunkCount: number;
  suppliedContextLength: number;
  timedOut: boolean;
  retrievalDurationMs: number;
}

export interface PlannerRAGPreparation {
  context: PlannerRetrievalContext | null;
  diagnostics: PlannerRAGDiagnostics;
}

export interface PlannerRAGIntegrationOptions extends PlannerRetrievalLimits {
  timeoutMs: number;
}

const baseDiagnostics = (): PlannerRAGDiagnostics => ({
  retrievalAttempted: false,
  retrievalUsed: false,
  fallbackReason: null,
  selectedStrategy: "hybrid",
  suppliedChunkCount: 0,
  suppliedContextLength: 0,
  timedOut: false,
  retrievalDurationMs: 0,
});

export class PlannerRAGIntegration {
  public constructor(
    private readonly mode: HybridRAGMode,
    private readonly service: HybridRAGService,
    private readonly options: PlannerRAGIntegrationOptions,
    private readonly reportFailure: (reason: string) => void = () => undefined,
  ) {}

  public async prepare(
    requirements: string,
    platform: Platform,
    analysis: DetectedProcessSummary,
  ): Promise<PlannerRAGPreparation> {
    const started = performance.now();
    const diagnostics = baseDiagnostics();
    if (this.mode === "off") {
      diagnostics.fallbackReason = "mode_off";
      return { context: null, diagnostics };
    }
    diagnostics.retrievalAttempted = true;
    let timer: NodeJS.Timeout | undefined;
    try {
      const operation = (async () => {
        const health = await this.service.health();
        if (!health.initialized || !health.ready) throw new Error("provider_unhealthy");
        const request = adaptPlannerRetrievalRequest(
          requirements,
          platform,
          analysis,
          this.options.maximumResults,
        );
        const result = await this.service.retrieve(request);
        return buildPlannerRetrievalContext(result, platform, health.provider, "hybrid", this.options);
      })();
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("retrieval_timeout")), this.options.timeoutMs);
      });
      const context = await Promise.race([operation, timeout]);
      if (!context) {
        diagnostics.fallbackReason = "no_results";
        return { context: null, diagnostics };
      }
      diagnostics.retrievalUsed = true;
      diagnostics.suppliedChunkCount = context.items.length;
      diagnostics.suppliedContextLength = context.items.reduce((sum, item) => sum + item.content.length, 0);
      return { context, diagnostics };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "retrieval_failed";
      diagnostics.fallbackReason = reason;
      diagnostics.timedOut = reason === "retrieval_timeout";
      this.reportFailure(reason);
      return { context: null, diagnostics };
    } finally {
      if (timer) clearTimeout(timer);
      diagnostics.retrievalDurationMs = Number((performance.now() - started).toFixed(2));
    }
  }
}
