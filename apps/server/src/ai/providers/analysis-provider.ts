import type { CanonicalWorkflow, Platform } from '@awm/shared';

export interface AnalysisProviderInput { scope: string; projectName: string; platform: Platform }
export interface GroundedPlannerRequest {
  system: string;
  user: string;
  outputSchema: Record<string, unknown>;
  signal?: AbortSignal;
  maximumOutputCharacters?: number;
}
export interface GroundedPlannerResponse {
  content: unknown;
  timeToFirstByteMs: number | null;
  outputCharacters: number;
}
export interface AnalysisProviderStatus { provider: 'local' | 'openai' | 'ollama'; available: boolean; models: string[]; message: string }
export interface AnalysisProvider {
  readonly name: 'local' | 'openai' | 'ollama';
  analyze(input: AnalysisProviderInput): Promise<unknown>;
  planGrounded?(request: GroundedPlannerRequest): Promise<unknown>;
  planGroundedDetailed?(request: GroundedPlannerRequest): Promise<GroundedPlannerResponse>;
  getStatus(): Promise<AnalysisProviderStatus>;
}
export type ValidatedAnalysis = CanonicalWorkflow;
