import {
  processAnalysisDiagnosticsSchema,
  type ProcessAnalysis,
  type ProcessAnalysisDiagnostics,
  type ProcessSignal,
} from '@awm/shared';

const TOTAL_CATEGORIES = 10 as const;

const uniqueValues = (values: string[]) =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))];

const level = (score: number): 'low' | 'medium' | 'high' =>
  score >= 85 ? 'high' : score >= 60 ? 'medium' : 'low';

export class ProcessAnalysisDiagnosticsService {
  public create(analysis: ProcessAnalysis): ProcessAnalysisDiagnostics {
    const signalGroups = [
      analysis.actors,
      analysis.externalSystems,
      analysis.triggers,
      analysis.outcomes,
      analysis.approvals,
      analysis.waits,
      analysis.retries,
      analysis.loops,
      analysis.synchronizations,
      analysis.missingInformation,
    ];
    const signals = signalGroups.flat();
    const tracedSignals = signals.filter((signal) => signal.sourceReferences.length > 0).length;
    const evidenceBackedSignals = signals.filter((signal) => signal.evidenceIds.length > 0).length;
    const confidenceScore = confidence(signals);
    const detectedCategories = [
      analysis.businessObjective.trim().length > 0,
      analysis.actors.length > 0,
      analysis.externalSystems.length > 0,
      analysis.triggers.length > 0,
      analysis.outcomes.length > 0,
      analysis.approvals.length > 0,
      analysis.waits.length > 0,
      analysis.retries.length > 0,
      analysis.loops.length > 0,
      analysis.synchronizations.length > 0,
    ].filter(Boolean).length;
    const baseCoverage = Math.round((detectedCategories / TOTAL_CATEGORIES) * 100);
    const coverageScore = Math.max(0, baseCoverage - Math.min(25, analysis.missingInformation.length * 5));

    return processAnalysisDiagnosticsSchema.parse({
      version: '1.0',
      rulesVersion: '1.0',
      businessObjective: analysis.businessObjective,
      actors: values(analysis.actors),
      applicationsAndSystems: values(analysis.externalSystems),
      triggers: values(analysis.triggers),
      outcomes: values(analysis.outcomes),
      approvals: values(analysis.approvals),
      waits: analysis.waits.map((wait) => ({ value: wait.value, kind: wait.kind })),
      retries: values(analysis.retries),
      loops: values(analysis.loops),
      synchronizationSignals: values(analysis.synchronizations),
      missingInformation: values(analysis.missingInformation),
      summary: {
        confidence: {
          score: confidenceScore,
          level: level(confidenceScore),
          tracedSignals,
          evidenceBackedSignals,
          totalSignals: signals.length,
        },
        coverage: {
          score: coverageScore,
          level: level(coverageScore),
          detectedCategories,
          totalCategories: TOTAL_CATEGORIES,
          missingInformationCount: analysis.missingInformation.length,
        },
      },
    });
  }
}

function values(signals: ProcessSignal[]): string[] {
  return uniqueValues(signals.map((signal) => signal.value));
}

function confidence(signals: ProcessSignal[]): number {
  if (!signals.length) return 100;
  const score = signals.reduce((sum, signal) => {
    if (signal.evidenceIds.length > 0) return sum + 1;
    if (signal.sourceReferences.length > 0) return sum + 0.9;
    return sum + 0.5;
  }, 0);
  return Math.round((score / signals.length) * 100);
}
