import {
  processAnalysisSchema,
  type DetectedProcessSummary,
  type ProcessAnalysis,
  type ProcessSignal,
  type ProcessWait,
} from '@awm/shared';
import { SemanticRequirementAnalyzer } from '../analysis/semantic-requirement-analyzer.js';
import { RequirementAnalysisNormalizer } from '../planner/requirement-analysis-normalizer.js';

const normalizeText = (value: string) =>
  value.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean).join('\n');

const signalKey = (signal: ProcessSignal) =>
  `${signal.value.toLowerCase()}:${signal.sourceReferences.map((reference) => reference.segmentId).join(',')}`;

const uniqueSignals = <T extends ProcessSignal>(signals: T[]): T[] =>
  [...new Map(signals.map((signal) => [signalKey(signal), signal])).values()];

export class ProcessIntelligenceService {
  public constructor(
    private readonly normalizer = new RequirementAnalysisNormalizer(),
    private readonly semanticAnalyzer = new SemanticRequirementAnalyzer(),
  ) {}

  public analyze(requirements: string, detected: DetectedProcessSummary): ProcessAnalysis {
    const normalizedRequirements = normalizeText(requirements);
    const requirementAnalysis = this.normalizer.normalize(normalizedRequirements, detected);
    const semanticAnalysis = this.semanticAnalyzer.analyze(normalizedRequirements);
    const workflowSignals = (values: string[]) => detected.facts
      .filter((fact) => fact.kind === 'workflow_function' && values.includes(fact.value))
      .map((fact): ProcessSignal => ({
        value: fact.value,
        factIds: [fact.id],
        evidenceIds: fact.evidence.map((evidence) => evidence.id),
        sourceReferences: requirementAnalysisSourceReferences(fact.id, requirementAnalysis),
      }));
    const waits: ProcessWait[] = requirementAnalysis.waits.map((wait) => ({
      ...wait,
      kind: classifyWait(wait.value),
    }));

    return processAnalysisSchema.parse({
      version: '1.0',
      originalRequirements: requirements,
      normalizedRequirements,
      businessObjective: requirementAnalysis.objective,
      actors: uniqueSignals([
        ...requirementAnalysis.actors,
        ...extractSignals(normalizedRequirements, /\b(?:manager|owner|reviewer|approver|finance|hr|employee|customer|client|lead|sales representative|administrator|admin|requester|agent|technician|contractor|team)\b/gi),
      ]),
      externalSystems: requirementAnalysis.applications,
      triggers: requirementAnalysis.trigger ? [requirementAnalysis.trigger] : [],
      outcomes: requirementAnalysis.endStates,
      approvals: requirementAnalysis.approvals,
      waits,
      retries: requirementAnalysis.retries,
      loops: requirementAnalysis.repetitions,
      synchronizations: uniqueSignals(workflowSignals(['merge', 'aggregator'])),
      missingInformation: uniqueSignals([
        ...requirementAnalysis.uncertainties,
        ...extractSignals(normalizedRequirements, /\b(?:not specified|not provided|unknown|to be confirmed|tbd|needs? clarification)\b[^.\n]*/gi),
      ]),
      requirementAnalysis,
      semanticAnalysis,
    });
  }
}

function extractSignals(source: string, expression: RegExp): ProcessSignal[] {
  const signals: ProcessSignal[] = [];
  for (const match of source.matchAll(expression)) {
    const value = match[0]?.trim();
    if (!value) continue;
    const start = match.index ?? 0;
    signals.push({
      value,
      factIds: [],
      evidenceIds: [],
      sourceReferences: [{
        segmentId: 'process-scope',
        stepId: 'process-scope',
        start,
        end: start + value.length,
        text: value,
      }],
    });
  }
  return signals;
}

function classifyWait(value: string): ProcessWait['kind'] {
  if (/\b(?:seconds?|minutes?|hours?|days?|weeks?|tomorrow|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i.test(value)) return 'duration';
  if (/\b(?:approval|callback|response|signature|payment|status|event)\b/i.test(value)) return 'event';
  return 'unspecified';
}

function requirementAnalysisSourceReferences(
  factId: string,
  analysis: ProcessAnalysis['requirementAnalysis'],
): ProcessSignal['sourceReferences'] {
  const values = [
    ...analysis.entities,
    ...analysis.applications,
    ...analysis.decisions,
    ...analysis.waits,
    ...analysis.repetitions,
    ...analysis.approvals,
    ...analysis.retries,
    ...analysis.errorHandling,
  ];
  return values.find((value) => value.factIds.includes(factId))?.sourceReferences ?? [];
}
