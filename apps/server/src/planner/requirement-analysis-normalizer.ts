import {
  normalizedRequirementAnalysisSchema,
  type DetectedProcessFact,
  type DetectedProcessSummary,
  type NormalizedRequirementAnalysis,
  type RequirementSourceReference,
} from '@awm/shared';

type TracedValue = NormalizedRequirementAnalysis['entities'][number];

const unique = <T>(items: T[], key: (item: T) => string) =>
  [...new Map(items.map((item) => [key(item), item])).values()];

function referencesForFact(fact: DetectedProcessFact, analysis: DetectedProcessSummary): RequirementSourceReference[] {
  const segmentIds = new Set([
    ...(fact.subject?.segmentId ? [fact.subject.segmentId] : []),
    ...fact.evidence.map((item) => item.sourceLocation.segmentId).filter((item): item is string => Boolean(item)),
  ]);
  return (analysis.segments ?? [])
    .filter((segment) => segmentIds.has(segment.id))
    .map((segment) => ({ segmentId: segment.id, stepId: segment.stepId, start: segment.start, end: segment.end, text: segment.text }));
}

function fromFacts(analysis: DetectedProcessSummary, predicate: (fact: DetectedProcessFact) => boolean): TracedValue[] {
  return unique(analysis.facts.filter(predicate).map((fact) => ({
    value: fact.value,
    factIds: [fact.id],
    evidenceIds: fact.evidence.map((item) => item.id),
    sourceReferences: referencesForFact(fact, analysis),
  })), (item) => `${item.value}:${item.sourceReferences.map((ref) => ref.segmentId).join(',')}`);
}

function fromExpression(scope: string, analysis: DetectedProcessSummary, expression: RegExp): TracedValue[] {
  const results: TracedValue[] = [];
  for (const segment of analysis.segments?.filter((item) => item.kind === 'clause') ?? []) {
    const match = expression.exec(segment.text);
    expression.lastIndex = 0;
    if (!match?.[0]) continue;
    results.push({
      value: match[1]?.trim() || match[0].trim(),
      factIds: [],
      evidenceIds: [],
      sourceReferences: [{ segmentId: segment.id, stepId: segment.stepId, start: segment.start, end: segment.end, text: segment.text }],
    });
  }
  if (!results.length) {
    const match = expression.exec(scope);
    expression.lastIndex = 0;
    if (match?.[0]) results.push({
      value: match[1]?.trim() || match[0].trim(),
      factIds: [],
      evidenceIds: [],
      sourceReferences: [{ segmentId: 'scope', stepId: 'scope', start: match.index, end: match.index + match[0].length, text: match[0] }],
    });
  }
  return unique(results, (item) => `${item.value}:${item.sourceReferences[0]?.start ?? 0}`);
}

export class RequirementAnalysisNormalizer {
  public normalize(scope: string, analysis: DetectedProcessSummary): NormalizedRequirementAnalysis {
    const objectiveMatch = /(?:business\s+objective|objective|goal)\s*:?\s*([^.\n]+\.?)/i.exec(scope);
    const objective = objectiveMatch?.[1]?.trim() || scope.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || 'Understand the requested automation.';
    const functions = (value: string) => fromFacts(analysis, (fact) => fact.kind === 'workflow_function' && fact.value === value);
    const decisions = fromFacts(analysis, (fact) => fact.kind === 'decision' || (fact.kind === 'workflow_function' && ['binary-condition', 'multi-route-decision', 'filter'].includes(fact.value)));
    const trigger = fromExpression(scope, analysis, /\b(?:when|whenever|on|upon|trigger(?:ed)? by)\s+([^.;\n]+)/i)[0] ?? null;
    const endStates = [
      ...fromExpression(scope, analysis, /\b(?:end|finish|complete|terminate|stop)\s+(?:the\s+)?(?:workflow|process)?\s*(?:when|after|as)?\s*([^.;\n]*)/gi),
      ...fromExpression(scope, analysis, /\b(?:approved|rejected|completed|failed|cancelled|escalated)\s+(?:end|outcome|state)\b/gi),
    ];
    const actors = fromExpression(scope, analysis, /\b(?:manager|owner|reviewer|approver|finance|hr|employee|customer|client|lead|sales representative|administrator|admin|requester|agent|technician|contractor|team)\b/gi);
    const identifiers = fromExpression(scope, analysis, /\b([a-z][a-z -]*(?:id|number|reference|key))\b/gi);
    const lifecycleStages = fromExpression(scope, analysis, /\b(?:stage|phase|status|section)\s+(?:is|becomes?|changes?\s+to|moves?\s+to|equals?)?\s*["']?([a-z][a-z -]{1,40})/gi);
    const statuses = fromExpression(scope, analysis, /\b(?:status|stage|section)\s+(?:is|becomes?|changes?\s+to|moves?\s+to|equals?)\s*["']?([a-z][a-z -]{1,40})/gi);
    const uncertainties = [
      ...fromFacts(analysis, (fact) => fact.kind === 'uncertainty'),
      ...analysis.clarifications.map((item) => ({
        value: item.missingFact,
        factIds: [],
        evidenceIds: item.evidence.map((evidence) => evidence.id),
        sourceReferences: item.evidence.flatMap((evidence) => {
          const segment = analysis.segments?.find((candidate) => candidate.id === evidence.sourceLocation.segmentId);
          return segment ? [{ segmentId: segment.id, stepId: segment.stepId, start: segment.start, end: segment.end, text: segment.text }] : [];
        }),
      })),
    ];

    return normalizedRequirementAnalysisSchema.parse({
      version: '2.1',
      objective,
      trigger,
      endStates,
      entities: fromFacts(analysis, (fact) => fact.kind === 'entity'),
      applications: fromFacts(analysis, (fact) => fact.kind === 'application'),
      actors,
      identifiers,
      lifecycleStages,
      statuses,
      decisions,
      waits: [...functions('delay'), ...fromExpression(scope, analysis, /\b(?:wait|await|pause)\b[^.;\n]*/gi)],
      repetitions: [...fromFacts(analysis, (fact) => fact.kind === 'repetition'), ...functions('loop')],
      approvals: functions('human-approval'),
      retries: functions('retry'),
      errorHandling: functions('error-handler'),
      duplicatePrevention: fromExpression(scope, analysis, /\b(?:deduplicate|prevent duplicates?|avoid duplicates?|find before creat(?:e|ing)|create or update)\b[^.;\n]*/gi),
      auditRequirements: [...functions('logging'), ...fromExpression(scope, analysis, /\b(?:audit|log|record history|track changes?)\b[^.;\n]*/gi)],
      assumptions: [],
      uncertainties,
    });
  }
}
