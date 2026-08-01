import {
  CAPABILITY_DETECTION_SCHEMA_VERSION,
  createEmptyCapabilityDetectionResult,
  nodeFunctionDetectorInputSchema,
  parseCapabilityDetectionResult,
  type CapabilityDetectionAmbiguity,
  type CapabilityDetectionCandidate,
  type CapabilityDetectionEvidence,
  type CapabilityDetectionResult,
  type NodeFunctionDetector,
  type NodeFunctionDetectorInput,
} from '../capability-detection.js';
import { extractSemanticWaitFacts, type SemanticWaitFact } from './semantic-wait-facts.js';

interface SourceScope { text: string; start: number; end: number }
const statementScopes = (source: string): SourceScope[] => {
  const scopes: SourceScope[] = [];
  for (const match of source.matchAll(/[^.!?\n]+[.!?]?/g)) {
    const raw = match[0];
    const leading = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (text) {
      const start = (match.index ?? 0) + leading;
      scopes.push({ text, start, end: start + text.length });
    }
  }
  return scopes;
};

const clean = (value: string) => value.trim().replace(/^[,;:\s]+|[,;.!?\s]+$/g, '').replace(/\s+/g, ' ');
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'boundary';
const recurringLanguage = /\b(?:every|each)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)?\s*(?:seconds?|minutes?|hours?|days?|weeks?|months?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const excludedWaitLanguage = /\b(?:check|poll|retry|remind|reminder|run|schedule)\b/i;
const arrivalTrigger = /^when\b[\s\S]*\b(?:arrives?|received|created|submitted)\b/i;
const durationPattern = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:seconds?|minutes?|hours?|days?|weeks?|months?)\b/i;

type WaitType = 'duration' | 'until-date' | 'until-event' | 'until-response' | 'until-approval';
interface WaitMatch {
  waitType?: WaitType;
  boundary: string;
  resumeMeaning: string;
  explicitResumeBoundary: boolean;
  duration?: string;
  date?: string;
  event?: string;
  timeoutOutcome?: string;
  semanticFact?: SemanticWaitFact;
}

const classifyBoundary = (boundary: string): WaitType | undefined => {
  if (/\b(?:approv(?:al|ed)|authori[sz](?:ation|ed)|consent)\b/i.test(boundary)) return 'until-approval';
  if (/\b(?:repl(?:y|ies)|responds?|response)\b/i.test(boundary)) return 'until-response';
  if (/\b(?:due date|deadline|scheduled date|calendar date|date)\b/i.test(boundary)) return 'until-date';
  if (/\b(?:received|arrives?|submitted|signed|completed|available|occurs?|happens?)\b/i.test(boundary)) return 'until-event';
  return undefined;
};

const matchWait = (scope: SourceScope): WaitMatch | undefined => {
  if (recurringLanguage.test(scope.text) || excludedWaitLanguage.test(scope.text) || arrivalTrigger.test(scope.text)) return undefined;
  const duration = scope.text.match(/^\s*(?:wait|pause|hold)(?:\s+processing)?\s+(?:for\s+)?(.+?)\s+before\s+(.+?)[.!?]?\s*$/i);
  if (duration && durationPattern.test(duration[1]!)) {
    const amount = clean(duration[1]!);
    const next = clean(duration[2]!);
    return { waitType: 'duration', boundary: amount, duration: amount, resumeMeaning: `Resume before ${next}`, explicitResumeBoundary: true };
  }
  const resume = scope.text.match(/^\s*resume\s+after\s+(.+?)[.!?]?\s*$/i);
  if (resume) {
    const boundary = clean(resume[1]!);
    return { waitType: classifyBoundary(boundary) ?? 'until-event', boundary, resumeMeaning: `Resume after ${boundary}`, explicitResumeBoundary: true };
  }
  const approvalWait = scope.text.match(/^\s*wait\s+for\s+(.+?\s+to\s+approve(?:\s+or\s+reject)?\s+.+?)[.!?]?\s*$/i);
  if (approvalWait) {
    const boundary = clean(approvalWait[1]!);
    return { waitType: 'until-approval', boundary, resumeMeaning: `Resume after ${boundary}`, explicitResumeBoundary: false };
  }
  const until = scope.text.match(/^\s*(?:wait|pause|hold(?:\s+processing)?)(?:\s+this)?\s+until\s+(.+?)[.!?]?\s*$/i);
  if (until) {
    const boundary = clean(until[1]!);
    const waitType = classifyBoundary(boundary);
    return { boundary, resumeMeaning: `Resume when ${boundary}`, explicitResumeBoundary: false, ...(waitType ? { waitType } : {}) };
  }
  return undefined;
};

const buildWaitResult = (sourceRequirement: string, matches: Array<{ scope: SourceScope; match: WaitMatch }>): CapabilityDetectionResult => {
  if (!matches.length) return createEmptyCapabilityDetectionResult(sourceRequirement, 'deterministic-wait-detector', '1.0');
  const evidence: CapabilityDetectionEvidence[] = [];
  const candidates: CapabilityDetectionCandidate[] = [];
  const ambiguities: CapabilityDetectionAmbiguity[] = [];
  const unresolvedQuestions: string[] = [];
  for (const { scope, match } of matches) {
    const key = `${scope.start}-${scope.end}`;
    const evidenceId = `wait-evidence-${key}`;
    evidence.push({ id: evidenceId, sourceText: scope.text, sourceStart: scope.start, sourceEnd: scope.end, explanation: 'The source states an internal pause or resume boundary.' });
    const ambiguityIds: string[] = [];
    if (!match.waitType) {
      const id = `wait-boundary-ambiguity-${key}`;
      const question = `What event, response, approval, date, or duration should resume work after "${match.boundary}"?`;
      ambiguities.push({ id, description: `The resume boundary "${match.boundary}" is incomplete.`, severity: 'high', clarificationQuestion: question, affectedEvidenceIds: [evidenceId] });
      ambiguityIds.push(id);
      unresolvedQuestions.push(question);
    }
    candidates.push({
      id: `wait-candidate-${key}`,
      nodeFunctionId: 'wait',
      name: match.waitType ? `Wait ${match.boundary}` : 'Wait for a clarified boundary',
      explanation: match.waitType
        ? `Pause work at the stated ${match.waitType} boundary and ${match.resumeMeaning.toLowerCase()}${match.timeoutOutcome ? `; if the boundary times out, ${match.timeoutOutcome}.` : '.'}`
        : `Pause work until the stated boundary is clarified.`,
      evidenceIds: [evidenceId],
      confidence: match.waitType
        ? { score: 0.95, level: 'high', reason: match.semanticFact?.confidenceReason ?? 'The pause boundary and resume meaning are explicit.' }
        : { score: 0.68, level: 'medium', reason: 'Pause language is explicit, but the resume boundary type is unclear.' },
      ambiguityIds,
      suggestedReviewState: 'required',
      relatedEntityHints: [{ entityType: 'wait', temporaryId: `wait-${scope.start}-${slug(match.boundary)}`, description: `A business wait boundary for ${match.boundary}.` }],
      metadata: {
        scope: `${scope.start}:${scope.end}`,
        requirementBasis: 'explicit',
        boundaryDescription: match.boundary,
        resumeMeaning: match.resumeMeaning,
        explicitResumeBoundary: String(match.explicitResumeBoundary),
        ...(match.waitType ? { waitType: match.waitType } : {}),
        ...(match.duration ? { durationDescription: match.duration } : {}),
        ...(match.date ? { dateDescription: match.date } : {}),
        ...(match.event ? { eventDescription: match.event } : {}),
        ...(match.timeoutOutcome ? { timeoutOutcome: match.timeoutOutcome } : {}),
      },
    });
  }
  return parseCapabilityDetectionResult({ schemaVersion: CAPABILITY_DETECTION_SCHEMA_VERSION, sourceRequirement, detectorId: 'deterministic-wait-detector', detectorVersion: '1.0', candidates, evidence, ambiguities, warnings: [], unresolvedQuestions });
};

export class WaitDetector implements NodeFunctionDetector {
  readonly id = 'deterministic-wait-detector';
  readonly version = '1.0';
  readonly supportedNodeFunctionIds = Object.freeze(['wait'] as const);
  detect(input: NodeFunctionDetectorInput): CapabilityDetectionResult {
    const parsed = nodeFunctionDetectorInputSchema.parse(input);
    const semanticMatches: Array<{ scope: SourceScope; match: WaitMatch }> = extractSemanticWaitFacts(parsed.sourceRequirement).map((fact) => ({
      scope: { text: fact.evidenceText, start: fact.sourceStart, end: fact.sourceEnd },
      match: {
        waitType: fact.waitType,
        boundary: fact.boundaryDescription,
        resumeMeaning: `Resume after ${fact.eventDescription ?? fact.dateDescription ?? fact.durationDescription ?? fact.boundaryDescription}`,
        explicitResumeBoundary: true,
        ...(fact.durationDescription ? { duration: fact.durationDescription } : {}),
        ...(fact.dateDescription ? { date: fact.dateDescription } : {}),
        ...(fact.eventDescription ? { event: fact.eventDescription } : {}),
        ...(fact.timeoutOutcome ? { timeoutOutcome: fact.timeoutOutcome } : {}),
        semanticFact: fact,
      },
    }));
    const fallbackMatches = statementScopes(parsed.sourceRequirement).map((scope) => ({ scope, match: matchWait(scope) }))
      .filter((item): item is { scope: SourceScope; match: WaitMatch } => Boolean(item.match));
    const deduplicatedFallback = fallbackMatches.filter(({ scope }) => !semanticMatches.some((semantic) => scope.start < semantic.scope.end && semantic.scope.start < scope.end));
    return buildWaitResult(parsed.sourceRequirement, [...semanticMatches, ...deduplicatedFallback].sort((left, right) => left.scope.start - right.scope.start));
  }
}

interface ApprovalMatch { subject: string; approver?: string; hasOutcomes: boolean }
const descriptiveApproval = /\bapproved\s+(?:social\s+posts?|content|records?|requests?)\b/i;
const excludedApproval = /\b(?:automatically|automatic)\b[\s\S]*\b(?:validate|verify|check|approv)/i;

const matchApproval = (scope: SourceScope): ApprovalMatch | undefined => {
  if (descriptiveApproval.test(scope.text) || excludedApproval.test(scope.text) || /^notify\b/i.test(scope.text) || /^if\b/i.test(scope.text)) return undefined;
  let match = scope.text.match(/^\s*send\s+(?:the\s+)?(.+?)\s+to\s+(?:the\s+)?(.+?)\s+for\s+approval[.!?]?\s*$/i);
  if (match) return { subject: clean(match[1]!), approver: clean(match[2]!), hasOutcomes: false };
  match = scope.text.match(/^\s*wait\s+for\s+(?:the\s+)?(.+?)\s+to\s+approve\s+or\s+reject\s+(?:the\s+)?(.+?)[.!?]?\s*$/i);
  if (match) return { subject: clean(match[2]!), approver: clean(match[1]!), hasOutcomes: true };
  match = scope.text.match(/^\s*(?:the\s+)?(.+?)\s+must\s+approve\s+(?:the\s+)?(.+?)\s+before\s+(.+?)[.!?]?\s*$/i);
  if (match) return { subject: clean(match[2]!), approver: clean(match[1]!), hasOutcomes: false };
  match = scope.text.match(/^\s*require\s+human\s+review\s+before\s+(.+?)[.!?]?\s*$/i);
  if (match) return { subject: clean(match[1]!), hasOutcomes: false };
  return undefined;
};

const buildApprovalResult = (sourceRequirement: string, matches: Array<{ scope: SourceScope; match: ApprovalMatch }>): CapabilityDetectionResult => {
  if (!matches.length) return createEmptyCapabilityDetectionResult(sourceRequirement, 'deterministic-approval-detector', '1.0');
  const evidence: CapabilityDetectionEvidence[] = [];
  const candidates: CapabilityDetectionCandidate[] = [];
  const ambiguities: CapabilityDetectionAmbiguity[] = [];
  const unresolvedQuestions: string[] = [];
  for (const { scope, match } of matches) {
    const key = `${scope.start}-${scope.end}`;
    const evidenceId = `approval-evidence-${key}`;
    evidence.push({ id: evidenceId, sourceText: scope.text, sourceStart: scope.start, sourceEnd: scope.end, explanation: `The source states an active human approval boundary for ${match.subject}.` });
    const ambiguityIds: string[] = [];
    const addAmbiguity = (kind: string, description: string, question: string) => {
      const id = `approval-${kind}-ambiguity-${key}`;
      ambiguities.push({ id, description, severity: 'high', clarificationQuestion: question, affectedEvidenceIds: [evidenceId] });
      ambiguityIds.push(id);
      unresolvedQuestions.push(question);
    };
    if (!match.approver) addAmbiguity('approver', `The approver for ${match.subject} is not named.`, `Who must review or approve ${match.subject}?`);
    if (!match.hasOutcomes) addAmbiguity('outcomes', `The required approval outcomes for ${match.subject} are not explicit.`, `What should happen when ${match.subject} is approved or rejected?`);
    const hints = [
      { entityType: 'approval' as const, temporaryId: `approval-${scope.start}-${slug(match.subject)}`, description: `An active human approval boundary for ${match.subject}.` },
      ...(match.approver ? [{ entityType: 'actor' as const, temporaryId: `approval-actor-${scope.start}-${slug(match.approver)}`, description: `${match.approver} acts as the approver.` }] : []),
      ...(match.hasOutcomes ? [
        { entityType: 'decision' as const, temporaryId: `approval-decision-${scope.start}`, description: `The human decision for ${match.subject}.` },
        { entityType: 'route' as const, temporaryId: `approval-route-${scope.start}-approved`, description: `Approved outcome for ${match.subject}.` },
        { entityType: 'route' as const, temporaryId: `approval-route-${scope.start}-rejected`, description: `Rejected outcome for ${match.subject}.` },
      ] : []),
    ];
    candidates.push({
      id: `approval-candidate-${key}`,
      nodeFunctionId: 'approval',
      name: `Approve ${match.subject}`,
      explanation: `${match.approver ? `${match.approver} is responsible for` : 'A human is required for'} the approval decision for ${match.subject}.`,
      evidenceIds: [evidenceId],
      confidence: ambiguityIds.length
        ? { score: 0.72, level: 'medium', reason: 'Active approval is explicit, but required approval details need clarification.' }
        : { score: 0.97, level: 'high', reason: 'The approver, subject, and approved and rejected outcomes are explicit.' },
      ambiguityIds,
      suggestedReviewState: 'required',
      relatedEntityHints: hints,
      metadata: {
        scope: `${scope.start}:${scope.end}`,
        requirementBasis: 'explicit',
        approvalSubject: match.subject,
        ...(match.approver ? { approverRole: match.approver } : {}),
        ...(match.hasOutcomes ? { outcomeHints: 'Approved | Rejected' } : {}),
      },
    });
  }
  return parseCapabilityDetectionResult({ schemaVersion: CAPABILITY_DETECTION_SCHEMA_VERSION, sourceRequirement, detectorId: 'deterministic-approval-detector', detectorVersion: '1.0', candidates, evidence, ambiguities, warnings: [], unresolvedQuestions });
};

export class ApprovalDetector implements NodeFunctionDetector {
  readonly id = 'deterministic-approval-detector';
  readonly version = '1.0';
  readonly supportedNodeFunctionIds = Object.freeze(['approval'] as const);
  detect(input: NodeFunctionDetectorInput): CapabilityDetectionResult {
    const parsed = nodeFunctionDetectorInputSchema.parse(input);
    const matches = statementScopes(parsed.sourceRequirement).map((scope) => ({ scope, match: matchApproval(scope) }))
      .filter((item): item is { scope: SourceScope; match: ApprovalMatch } => Boolean(item.match));
    return buildApprovalResult(parsed.sourceRequirement, matches);
  }
}
