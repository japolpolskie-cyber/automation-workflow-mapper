import { analysisProgressEventSchema, type AnalysisProgressEvent, type AnalysisStage } from '@awm/shared';

export type AnalysisProgressReporter = (event: AnalysisProgressEvent) => void | Promise<void>;

export interface AnalysisPipelineContext {
  readonly analysisId: string;
  report(stage: AnalysisStage, percent: number, message: string): Promise<void>;
}

export class AnalysisPipeline {
  public constructor(private readonly reporter: AnalysisProgressReporter = () => undefined) {}

  public async run<T>(operation: (context: AnalysisPipelineContext) => Promise<T>): Promise<T> {
    const analysisId = crypto.randomUUID();
    let sequence = 0;
    const emit = async (stage: AnalysisStage, state: AnalysisProgressEvent['state'], percent: number, message: string) => {
      const event = analysisProgressEventSchema.parse({ analysisId, sequence: sequence++, stage, state, percent, message, occurredAt: new Date().toISOString() });
      try { await this.reporter(event); } catch { /* Observability must never alter workflow generation. */ }
    };
    const context: AnalysisPipelineContext = { analysisId, report: (stage, percent, message) => emit(stage, 'running', percent, message) };
    await emit('preparing', 'running', 0, 'Preparing workflow analysis.');
    try {
      const result = await operation(context);
      await emit('complete', 'completed', 100, 'Workflow analysis complete.');
      return result;
    } catch (error) {
      await emit('complete', 'failed', 100, 'Workflow analysis failed.');
      throw error;
    }
  }
}
