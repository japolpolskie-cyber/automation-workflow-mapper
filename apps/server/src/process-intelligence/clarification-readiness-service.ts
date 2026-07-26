import {
  processClarificationRecommendationsSchema,
  type ClarificationAnswerType,
  type ProcessAnalysis,
  type ProcessAnalysisDiagnostics,
  type ProcessClarificationCategory,
  type ProcessClarificationRecommendation,
  type ProcessSignal,
} from '@awm/shared';

type Importance = ProcessClarificationRecommendation['importance'];

interface RecommendationDefinition {
  question: string;
  reason: string;
  importance: Importance;
  suggestedAnswerType: ClarificationAnswerType;
  signals?: ProcessSignal[];
}

const categoryOrder: ProcessClarificationCategory[] = [
  'trigger',
  'outcome',
  'actor-owner',
  'application-system',
  'approval',
  'approval-timeout',
  'wait-resume-condition',
  'retry-policy',
  'loop-termination',
  'synchronization-behavior',
  'error-handling',
];
const importanceOrder: Record<Importance, number> = { required: 0, recommended: 1, optional: 2 };

export class ClarificationReadinessService {
  public create(
    analysis: ProcessAnalysis,
    diagnostics: ProcessAnalysisDiagnostics,
  ): ProcessClarificationRecommendation[] {
    const recommendations = new Map<ProcessClarificationCategory, ProcessClarificationRecommendation>();
    const add = (category: ProcessClarificationCategory, definition: RecommendationDefinition) => {
      const candidate = recommendation(category, definition);
      const existing = recommendations.get(category);
      if (!existing) {
        recommendations.set(category, candidate);
        return;
      }
      const importance = importanceOrder[candidate.importance] < importanceOrder[existing.importance]
        ? candidate.importance
        : existing.importance;
      recommendations.set(category, {
        ...existing,
        importance,
        sourceRequirementIds: [...new Set([...existing.sourceRequirementIds, ...candidate.sourceRequirementIds])].sort(),
      });
    };

    if (!diagnostics.triggers.length) add('trigger', {
      question: 'What event should start this workflow?',
      reason: 'No explicit workflow trigger was detected.',
      importance: 'required',
      suggestedAnswerType: 'text',
    });
    if (!diagnostics.outcomes.length) add('outcome', {
      question: 'What business outcome confirms that this workflow is complete?',
      reason: 'No explicit completion outcome was detected.',
      importance: 'recommended',
      suggestedAnswerType: 'text',
    });
    if (!diagnostics.applicationsAndSystems.length) add('application-system', {
      question: 'Which application or system should perform this process?',
      reason: 'No external application or system was identified.',
      importance: 'recommended',
      suggestedAnswerType: 'application',
    });
    if (/\b(?:owner|actor|approver|responsible person)\b[^.\n]{0,60}\b(?:not specified|not provided|unknown|tbd)\b/i.test(analysis.normalizedRequirements)) add('actor-owner', {
      question: 'Who owns or performs this step?',
      reason: 'The responsible actor or owner is explicitly unresolved.',
      importance: 'required',
      suggestedAnswerType: 'actor',
      signals: analysis.missingInformation,
    });

    if (diagnostics.approvals.length) {
      if (!diagnostics.actors.length || containsMissing(diagnostics, /\b(?:owner|actor|approver|who)\b/i)) add('actor-owner', {
        question: 'Who owns or approves this step?',
        reason: 'An approval is present but its responsible actor is unclear.',
        importance: 'required',
        suggestedAnswerType: 'actor',
        signals: analysis.approvals,
      });
      if (!/\b(?:timeout|within|after)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:minutes?|hours?|days?|weeks?)\b/i.test(analysis.normalizedRequirements)) add('approval-timeout', {
        question: 'How long should the workflow wait for approval before escalating or timing out?',
        reason: 'Approval behavior was detected without an explicit timeout policy.',
        importance: 'recommended',
        suggestedAnswerType: 'duration',
        signals: analysis.approvals,
      });
    } else if (containsMissing(diagnostics, /\bapprov/i)) {
      add('approval', {
        question: 'Does this process require an approval step?',
        reason: 'The requirements mention unresolved approval behavior.',
        importance: 'required',
        suggestedAnswerType: 'boolean',
        signals: analysis.missingInformation,
      });
    }

    if (analysis.waits.some((wait) => wait.kind === 'unspecified') || containsMissing(diagnostics, /\b(?:wait|resume|callback)\b/i)) add('wait-resume-condition', {
      question: 'What exact condition should resume the workflow after waiting?',
      reason: 'A wait was detected without a complete resume condition.',
      importance: 'required',
      suggestedAnswerType: 'text',
      signals: analysis.waits,
    });
    if (analysis.retries.length && !/\b(?:retry|attempt)\D{0,20}\d+\b|\b(?:maximum|max|up to)\s+\d+\s+(?:retries|attempts)\b/i.test(analysis.normalizedRequirements)) add('retry-policy', {
      question: 'How many retry attempts should be allowed, and what delay should apply between attempts?',
      reason: 'Retry behavior was detected without a bounded retry policy.',
      importance: 'recommended',
      suggestedAnswerType: 'text',
      signals: analysis.retries,
    });
    if (analysis.loops.length && !/\b(?:until|while|stop when|maximum|max|up to)\b/i.test(analysis.normalizedRequirements)) add('loop-termination', {
      question: 'What condition or maximum limit should stop the loop?',
      reason: 'Repeated processing was detected without an explicit termination condition.',
      importance: 'required',
      suggestedAnswerType: 'text',
      signals: analysis.loops,
    });
    if (analysis.synchronizations.length && !/\b(?:all|any|first|every|each)\s+(?:branch|result|response|approval|route)/i.test(analysis.normalizedRequirements)) add('synchronization-behavior', {
      question: 'Should processing continue after all branches complete, or after the first qualifying result?',
      reason: 'Synchronization was detected without an all-versus-any completion rule.',
      importance: 'recommended',
      suggestedAnswerType: 'single-choice',
      signals: analysis.synchronizations,
    });
    if ((analysis.retries.length || analysis.approvals.length) && !analysis.requirementAnalysis.errorHandling.length) add('error-handling', {
      question: 'What should happen if this operation ultimately fails?',
      reason: 'The process contains a recoverable boundary but no final failure behavior.',
      importance: 'optional',
      suggestedAnswerType: 'single-choice',
      signals: [...analysis.retries, ...analysis.approvals],
    });

    for (const missing of analysis.missingInformation) {
      const mapped = missingCategory(missing.value);
      if (!mapped) continue;
      const definition = definitions[mapped];
      add(mapped, { ...definition, signals: [missing], importance: 'required' });
    }

    return processClarificationRecommendationsSchema.parse(
      [...recommendations.values()].sort((left, right) =>
        importanceOrder[left.importance] - importanceOrder[right.importance]
        || categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category)
        || left.id.localeCompare(right.id)),
    );
  }
}

const definitions: Record<ProcessClarificationCategory, Omit<RecommendationDefinition, 'signals'>> = {
  trigger: { question: 'What event should start this workflow?', reason: 'The workflow trigger is missing or unclear.', importance: 'required', suggestedAnswerType: 'text' },
  outcome: { question: 'What business outcome confirms that this workflow is complete?', reason: 'The expected workflow outcome is missing or unclear.', importance: 'required', suggestedAnswerType: 'text' },
  'actor-owner': { question: 'Who owns or performs this step?', reason: 'The responsible actor or owner is missing or unclear.', importance: 'required', suggestedAnswerType: 'actor' },
  'application-system': { question: 'Which application or system should perform this step?', reason: 'The required application or system is missing or unclear.', importance: 'required', suggestedAnswerType: 'application' },
  approval: { question: 'Does this process require approval?', reason: 'Approval behavior is missing or unclear.', importance: 'required', suggestedAnswerType: 'boolean' },
  'approval-timeout': { question: 'How long should the workflow wait for approval?', reason: 'The approval timeout is missing or unclear.', importance: 'required', suggestedAnswerType: 'duration' },
  'wait-resume-condition': { question: 'What condition should resume the workflow after waiting?', reason: 'The wait or resume condition is missing or unclear.', importance: 'required', suggestedAnswerType: 'text' },
  'retry-policy': { question: 'What retry limit and delay policy should apply?', reason: 'The retry policy is missing or unclear.', importance: 'required', suggestedAnswerType: 'text' },
  'loop-termination': { question: 'What condition or maximum limit should stop the loop?', reason: 'The loop termination rule is missing or unclear.', importance: 'required', suggestedAnswerType: 'text' },
  'synchronization-behavior': { question: 'Should all branches complete, or may the first qualifying result continue?', reason: 'Synchronization behavior is missing or unclear.', importance: 'required', suggestedAnswerType: 'single-choice' },
  'error-handling': { question: 'What should happen when the operation fails?', reason: 'Error-handling behavior is missing or unclear.', importance: 'required', suggestedAnswerType: 'single-choice' },
};

function recommendation(
  category: ProcessClarificationCategory,
  definition: RecommendationDefinition,
): ProcessClarificationRecommendation {
  return {
    id: `process-clarification-${category}`,
    category,
    question: definition.question,
    reason: definition.reason,
    importance: definition.importance,
    sourceRequirementIds: sourceIds(definition.signals ?? []),
    suggestedAnswerType: definition.suggestedAnswerType,
  };
}

function sourceIds(signals: ProcessSignal[]): string[] {
  return [...new Set(signals.flatMap((signal) =>
    signal.factIds.length
      ? signal.factIds
      : signal.sourceReferences.map((reference) => reference.segmentId),
  ))].sort();
}

function containsMissing(diagnostics: ProcessAnalysisDiagnostics, expression: RegExp): boolean {
  return diagnostics.missingInformation.some((value) => expression.test(value));
}

function missingCategory(value: string): ProcessClarificationCategory | null {
  const mappings: Array<[RegExp, ProcessClarificationCategory]> = [
    [/\btrigger|start event/i, 'trigger'],
    [/\boutcome|result|completion/i, 'outcome'],
    [/\bowner|actor|approver|who\b/i, 'actor-owner'],
    [/\bapplication|system|platform|app\b/i, 'application-system'],
    [/\bapproval.{0,20}timeout|timeout.{0,20}approval/i, 'approval-timeout'],
    [/\bapprov/i, 'approval'],
    [/\bwait|resume|callback/i, 'wait-resume-condition'],
    [/\bretry|attempt/i, 'retry-policy'],
    [/\bloop|termination|stop condition/i, 'loop-termination'],
    [/\bmerge|synchroni[sz]|all branches|any branch/i, 'synchronization-behavior'],
    [/\berror|failure|fail\b/i, 'error-handling'],
  ];
  return mappings.find(([expression]) => expression.test(value))?.[1] ?? null;
}
