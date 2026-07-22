import type {
  CanonicalWorkflow,
  DetectedProcessSummary,
  Platform,
} from "@awm/shared";
import type { AnalysisProvider } from "../ai/providers/analysis-provider.js";
import type {
  PlannerRuntime,
  PlannerRuntimeResult,
} from "../planner/planner-runtime-service.js";
import type { HybridRAGMode } from "./contracts.js";
import type {
  PlannerRAGDiagnostics,
  PlannerRAGIntegration,
} from "./planner-rag-integration.js";

export interface HybridRAGRolloutDiagnostics {
  mode: HybridRAGMode;
  plannerPathSelected: "existing" | "hybrid-rag";
  fallbackOccurred: boolean;
  fallbackReason: string | null;
  retrievalStrategy: "hybrid";
  retrievalDurationMs: number;
  chunkCount: number;
  contextLength: number;
  comparisonExecuted: boolean;
}

export interface HybridRAGRolloutResult {
  result: PlannerRuntimeResult;
  diagnostics: HybridRAGRolloutDiagnostics;
}

const diagnosticsFrom = (
  mode: HybridRAGMode,
  retrieval: PlannerRAGDiagnostics | null,
): HybridRAGRolloutDiagnostics => ({
  mode,
  plannerPathSelected: "existing",
  fallbackOccurred: false,
  fallbackReason: retrieval?.fallbackReason ?? null,
  retrievalStrategy: "hybrid",
  retrievalDurationMs: retrieval?.retrievalDurationMs ?? 0,
  chunkCount: retrieval?.suppliedChunkCount ?? 0,
  contextLength: retrieval?.suppliedContextLength ?? 0,
  comparisonExecuted: false,
});

export class HybridRAGPlannerRollout {
  public constructor(
    private readonly mode: HybridRAGMode,
    private readonly integration: PlannerRAGIntegration,
    private readonly report: (diagnostics: HybridRAGRolloutDiagnostics) => void = () => undefined,
  ) {}

  public async execute(
    runtime: PlannerRuntime,
    provider: AnalysisProvider,
    objective: string,
    platform: Platform,
    analysis: DetectedProcessSummary,
    productionWorkflow: CanonicalWorkflow,
  ): Promise<HybridRAGRolloutResult> {
    if (this.mode === "off") {
      const result = await runtime.execute(provider, objective, platform, analysis, productionWorkflow);
      const diagnostics = diagnosticsFrom(this.mode, null);
      this.report(diagnostics);
      return { result, diagnostics };
    }

    const prepared = await this.integration.prepare(objective, platform, analysis);
    const diagnostics = diagnosticsFrom(this.mode, prepared.diagnostics);
    if (this.mode === "compare") {
      const existing = await runtime.execute(provider, objective, platform, analysis, productionWorkflow);
      if (prepared.context) {
        try {
          await runtime.execute(provider, objective, platform, analysis, productionWorkflow, undefined, prepared.context);
          diagnostics.comparisonExecuted = true;
        } catch (error) {
          diagnostics.fallbackOccurred = true;
          diagnostics.fallbackReason = error instanceof Error ? error.message : "rag_planner_failed";
        }
      } else {
        diagnostics.fallbackOccurred = true;
      }
      this.report(diagnostics);
      return { result: existing, diagnostics };
    }

    if (prepared.context) {
      try {
        const result = await runtime.execute(provider, objective, platform, analysis, productionWorkflow, undefined, prepared.context);
        diagnostics.plannerPathSelected = "hybrid-rag";
        this.report(diagnostics);
        return { result, diagnostics };
      } catch (error) {
        diagnostics.fallbackOccurred = true;
        diagnostics.fallbackReason = error instanceof Error ? error.message : "rag_planner_failed";
      }
    } else {
      diagnostics.fallbackOccurred = true;
    }
    const result = await runtime.execute(provider, objective, platform, analysis, productionWorkflow);
    this.report(diagnostics);
    return { result, diagnostics };
  }
}
