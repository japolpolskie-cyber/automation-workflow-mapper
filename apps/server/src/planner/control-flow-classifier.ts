import {
  controlFlowClassificationSchema,
  type ControlFlowClassification,
  type ControlFlowType,
  type DetectedProcessSummary,
  type RequirementSourceReference,
} from '@awm/shared';

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);

interface Candidate {
  type: ControlFlowType;
  expression: RegExp;
  reason: string;
  confidence: number;
  exclusivity?: ControlFlowClassification['branchExclusivity'];
  together?: boolean;
  synchronization?: boolean;
  waitKind?: NonNullable<ControlFlowClassification['wait']>['kind'];
}

const candidates: Candidate[] = [
  { type: 'conditional-parallel-routing', expression: /\b(?:any|multiple|several|each)\s+(?:of\s+)?(?:these\s+)?(?:rules?|conditions?|approvers?)\s+(?:may|can)\s+(?:apply|approve)|\b(?:notify|send to)\b[^.;]*(?:and|,)[^.;]*(?:independently|in parallel)/i, reason: 'Multiple rules or recipients may execute together, so the routes are non-exclusive.', confidence: 0.96, exclusivity: 'non-exclusive', together: true },
  { type: 'parallel-split', expression: /\b(?:in parallel|simultaneously|at the same time|fan out)\b/i, reason: 'The requirement explicitly starts multiple concurrent paths.', confidence: 0.98, exclusivity: 'non-exclusive', together: true },
  { type: 'multi-outcome-decision', expression: /\b(?:route|switch|choose|branch)\b[^.;]*(?:based on|by)\s+(?:status|category|priority|channel|service|type)|\b(?:if|when)\b[^.;]*(?:otherwise if|else if)[^.;]*(?:otherwise|else)\b/i, reason: 'Three or more mutually exclusive outcomes require a multi-outcome decision.', confidence: 0.96, exclusivity: 'exclusive' },
  { type: 'binary-decision', expression: /\b(?:if|when)\b[\s\S]{1,180}?\b(?:otherwise|else|if\s+not)\b|\b(?:process|save|create|send|notify|archive|continue|end|update|publish)\b[^.;\n]{1,120}\botherwise\b|\b(?:whether|has|did|is|does)\b[^?;.\n]{1,100}\?|\b(?:approve|reject|yes|no|success|failure|replied|not replied|continue|stop)\b[^.;]*(?:\bor\b|\/)[^.;]*/i, reason: 'Exactly two mutually exclusive business outcomes are stated.', confidence: 0.95, exclusivity: 'exclusive' },
  { type: 'human-review', expression: /\b(?:human|manual|manager|owner|reviewer|finance|hr)\s+(?:review|inspection|verification|response)\b|\breviewed by\b/i, reason: 'A human response is required before execution can resume.', confidence: 0.98, waitKind: 'human' },
  { type: 'approval', expression: /\b(?:ask|request|require|seek|obtain|await|send|route|submit)\b[^.;\n]{0,80}\b(?:approval|human review)\b|\b(?:for|pending|awaiting)\s+(?:human\s+)?approval\b|\b(?:manager|supervisor|director|owner|reviewer|finance|hr|human)\b[^.;\n]{0,60}\b(?:approve|approves|reject|rejects|review|reviews|decision)\b|\b(?:wait|pause)\b[^.;\n]{0,80}\b(?:approve|approves|approved|reject|rejects|rejected|approval|decision)\b|\b(?:if|when|once|after|on)\b[^.;\n]{0,80}\b(?:approved|rejected)\b[^.;\n]{0,100}\b(?:continue|otherwise|else|publish|proceed|return|revise|revision|stop|notify|create|update|send)\b|\b(?:approve|authorize|reject|decline|sign[- ]?off|green[- ]?light)\b[^.;\n]{0,80}\b(?:before|after|then|otherwise|else|or)\b/i, reason: 'The requirement contains an approval action, decision, request, review, or waiting boundary.', confidence: 0.98, waitKind: 'human' },
  { type: 'event-wait', expression: /\b(?:wait|pause)\s+(?:for|until)\s+(?:the\s+)?(?:signature|payment|webhook|reply|response|external event|document is signed|invoice is paid)(?:\s+is\s+(?:received|completed))?\b|\bawait\s+(?:the\s+)?(?:signature|payment|webhook|reply|response)\b|\bwhen\s+(?:the\s+)?(?:signature|payment|webhook|reply|response)\s+(?:arrives|is received|completes|succeeds)\b/i, reason: 'Execution resumes only after an external event.', confidence: 0.98, waitKind: 'external-event' },
  { type: 'delay', expression: /\b(?:wait|delay|pause|sleep)\s+(?:for\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:minutes?|hours?|days?|weeks?)\b|\bafter\s+(?:a\s+)?(?:period|delay)\b/i, reason: 'Execution pauses for a stated duration.', confidence: 0.98, waitKind: 'duration' },
  { type: 'filter', expression: /\b(?:continue only|discard|drop|ignore|stop)\b[^.;]*(?:unless|if|when|unmatched|invalid|nonmatching)/i, reason: 'Unmatched records stop without a visible alternate business path.', confidence: 0.94 },
  { type: 'iterator', expression: /\b(?:(?:for each|for every|each|every|all|collection of)\s+(?:the\s+)?(?:[a-z][a-z-]*))\b/i, reason: 'A collection is processed one item at a time.', confidence: 0.97 },
  { type: 'aggregator', expression: /\b(?:combine|compile|consolidate|aggregate|summarize)\s+(?:all\s+)?(?:the\s+)?(?:results?|items?|records?|responses?)\b|\bone\s+(?:result|summary|report)\s+from\s+(?:many|all)/i, reason: 'Many item results are combined into one downstream result.', confidence: 0.97 },
  { type: 'loop-until', expression: /\b(?:repeat until|loop until|return to|revise and resubmit|revision and resubmission|send back for revision)\b/i, reason: 'Execution returns to an earlier business step until an exit condition is met.', confidence: 0.97 },
  { type: 'retry', expression: /\bretry\b[^.;]*(?:\d+|one|two|three|four|five)\s+times?\b|\b(?:exponential|linear|fixed)\s+backoff\b/i, reason: 'A technical failure retry policy is explicitly stated.', confidence: 0.99 },
  { type: 'error-handler', expression: /\b(?:on|if|when|after)\s+(?:final\s+)?(?:failure|error)|\b(?:handle|catch)\s+(?:the\s+)?(?:failure|error)\b/i, reason: 'The requirement provides a distinct technical failure path.', confidence: 0.96 },
  { type: 'resume-point', expression: /\b(?:resume|continue)\s+(?:at|from|with|after)\b/i, reason: 'A continuation point is explicitly identified after a wait or interruption.', confidence: 0.94 },
  { type: 'subworkflow', expression: /\b(?:call|invoke|run|execute)\s+(?:the\s+)?(?:sub-?workflow|child workflow|reusable sub-?workflow|reusable workflow|subprocess)\b/i, reason: 'A reusable workflow boundary is explicit.', confidence: 0.98 },
  { type: 'termination', expression: /\b(?:end|finish|terminate|stop|complete)\s+(?:the\s+)?(?:workflow|process|route|path)\b/i, reason: 'The requirement explicitly terminates an execution path.', confidence: 0.96 },
  { type: 'merge-all', expression: /\b(?:wait for|require)\s+all\s+(?:approvers?|branches?|routes?|responses?)|\bmerge all\b|\brejoin after all\b/i, reason: 'All incoming paths must complete before continuation.', confidence: 0.98, synchronization: true },
  { type: 'merge-any', expression: /\b(?:continue after|resume when|first)\s+(?:any|one)\s+(?:approver|branch|route|response)|\bmerge any\b/i, reason: 'Continuation may occur when the first qualifying incoming path completes.', confidence: 0.96, synchronization: true },
];

export class ControlFlowClassifier {
  public classify(scope: string, analysis: DetectedProcessSummary): ControlFlowClassification[] {
    const segments = analysis.segments?.filter((segment) => segment.kind === 'clause') ?? [];
    const results: ControlFlowClassification[] = [];

    for (const candidate of candidates) {
      const steps = analysis.segments?.filter((segment) => segment.kind === 'step') ?? [];
      const binarySegments = steps.flatMap((segment, index) => {
        const next = steps[index + 1];
        if (!next || !/^(?:otherwise|else|if\s+not)\b/i.test(next.text)) return [segment];
        return [segment, { ...segment, id: `${segment.id}-${next.id}`, text: `${segment.text} ${next.text}`, end: next.end }];
      });
      const candidateSegments = candidate.type === 'binary-decision' ? binarySegments : segments;
      const matchingSegments = candidateSegments.filter((segment) => {
        const matched = candidate.expression.test(segment.text);
        candidate.expression.lastIndex = 0;
        return matched;
      });
      const units = matchingSegments.length
        ? matchingSegments
        : [{ id: 'scope', stepId: 'scope', start: 0, end: scope.length, text: scope, kind: 'clause' as const, index: 0 }];
      for (const segment of units) {
        const match = candidate.expression.exec(segment.text);
        candidate.expression.lastIndex = 0;
        if (!match?.[0]) continue;
        const reference: RequirementSourceReference = { segmentId: segment.id, stepId: segment.stepId, start: segment.start, end: segment.end, text: segment.text };
        const relatedFacts = analysis.facts.filter((fact) => fact.subject?.stepId === segment.stepId || fact.evidence.some((evidence) => evidence.sourceLocation.segmentId === segment.id));
        const matchedText = match[0];
        const retryAttempts = candidate.type === 'retry' ? this.retryAttempts(segment.text) : null;
        const backoff = candidate.type === 'retry' ? (/\b(exponential|linear|fixed)\s+backoff\b/i.exec(segment.text)?.[0] ?? null) : null;
        const collectionSource = candidate.type === 'iterator'
          ? (/\b(?:for each|for every|each|every|all|collection of)\s+(?:the\s+)?([a-z][a-z-]*)/i.exec(matchedText)?.[1]?.replace(/s$/, '') ?? 'item')
          : null;
        const loopTarget = candidate.type === 'loop-until'
          ? (/\b(?:return to|send back to)\s+([^,.;]+)/i.exec(segment.text)?.[1]?.trim() ?? 'the preceding review step')
          : null;
        const loopExit = candidate.type === 'loop-until'
          ? (/\buntil\s+([^,.;]+)/i.exec(segment.text)?.[1]?.trim() ?? 'the revision is accepted')
          : null;
        const resumeCondition = candidate.waitKind === 'duration'
          ? matchedText
          : candidate.waitKind === 'external-event'
            ? `Resume when ${matchedText.replace(/^(?:wait|await|pause)\s+(?:for|until)\s+/i, '')}`
            : candidate.waitKind === 'human'
              ? 'Resume after the required human response.'
              : null;
        const evidenceIds = [...new Set(relatedFacts.flatMap((fact) => fact.evidence.map((evidence) => evidence.id)))];
        results.push(controlFlowClassificationSchema.parse({
          id: `control-${candidate.type}-${slug(segment.id)}-${results.length + 1}`,
          type: candidate.type,
          factIds: [...new Set(relatedFacts.map((fact) => fact.id))],
          evidenceIds,
          sourceReferences: [reference],
          reason: candidate.reason,
          confidence: candidate.confidence,
          branchExclusivity: candidate.exclusivity ?? 'not-applicable',
          branchesMayExecuteTogether: candidate.together ?? false,
          synchronizationRequired: candidate.synchronization ?? false,
          wait: candidate.waitKind && resumeCondition ? { kind: candidate.waitKind, resumeCondition } : null,
          loop: loopTarget && loopExit ? { target: loopTarget, exitCondition: loopExit } : null,
          collectionSource,
          retryPolicy: candidate.type === 'retry' ? { maximumAttempts: retryAttempts, backoff } : null,
        }));
      }
    }

    return this.addApprovalSynchronization(scope, analysis, this.deduplicate(results));
  }

  private retryAttempts(text: string): number | null {
    const numeric = /\bretry\b[^.;]*?(\d+)\s+times?\b/i.exec(text)?.[1];
    if (numeric) return Number(numeric);
    const word = /\bretry\b[^.;]*?\b(one|two|three|four|five)\s+times?\b/i.exec(text)?.[1]?.toLowerCase();
    return word ? ({ one: 1, two: 2, three: 3, four: 4, five: 5 } as const)[word as 'one'] : null;
  }

  private deduplicate(items: ControlFlowClassification[]): ControlFlowClassification[] {
    return [...new Map(items.map((item) => [`${item.type}:${item.sourceReferences[0]?.segmentId}`, item])).values()];
  }

  private addApprovalSynchronization(scope: string, analysis: DetectedProcessSummary, items: ControlFlowClassification[]): ControlFlowClassification[] {
    const match = /\b(?:all|both)\s+((?:[a-z][a-z ]+\s+and\s+)?[a-z][a-z ]+)\s+(?:must\s+)?approve\b/i.exec(scope);
    if (!match) return items;
    const segment = analysis.segments?.find((item) => item.start <= match.index && item.end >= match.index + match[0].length)
      ?? { id: 'scope', stepId: 'scope', start: match.index, end: match.index + match[0].length, text: match[0] };
    const reference = { segmentId: segment.id, stepId: segment.stepId, start: segment.start, end: segment.end, text: segment.text };
    const facts = analysis.facts.filter((fact) => fact.subject?.stepId === segment.stepId);
    const base = {
      factIds: facts.map((fact) => fact.id),
      evidenceIds: [...new Set(facts.flatMap((fact) => fact.evidence.map((evidence) => evidence.id)))],
      sourceReferences: [reference],
      confidence: 0.98,
      wait: { kind: 'human' as const, resumeCondition: 'Resume after all required approvers respond.' },
      loop: null,
      collectionSource: null,
      retryPolicy: null,
    };
    return [
      ...items,
      controlFlowClassificationSchema.parse({
        id: `control-conditional-parallel-routing-${slug(segment.id)}-approvers`,
        type: 'conditional-parallel-routing',
        ...base,
        reason: 'Multiple approver rules may be evaluated independently.',
        branchExclusivity: 'non-exclusive',
        branchesMayExecuteTogether: true,
        synchronizationRequired: true,
      }),
      controlFlowClassificationSchema.parse({
        id: `control-merge-all-${slug(segment.id)}-approvers`,
        type: 'merge-all',
        ...base,
        reason: 'All required approvers must synchronize before continuation.',
        branchExclusivity: 'not-applicable',
        branchesMayExecuteTogether: false,
        synchronizationRequired: true,
      }),
    ];
  }
}
