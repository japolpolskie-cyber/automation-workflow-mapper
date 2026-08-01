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

interface SourceScope {
  text: string;
  start: number;
  end: number;
}

const statementScopes = (source: string): SourceScope[] => {
  const scopes: SourceScope[] = [];
  const matcher = /[^.!?\n]+[.!?]?/g;
  for (const match of source.matchAll(matcher)) {
    const raw = match[0];
    const leading = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (!text) continue;
    const start = (match.index ?? 0) + leading;
    const scope = { text, start, end: start + text.length };
    if (/^(?:otherwise|else|if\s+not)\b/i.test(text) && scopes.length > 0) {
      const previous = scopes.pop()!;
      scopes.push({ text: source.slice(previous.start, scope.end), start: previous.start, end: scope.end });
    } else scopes.push(scope);
  }
  return scopes;
};

const cleanPart = (value: string) => value.trim().replace(/^[,;:\s]+|[,;.!?\s]+$/g, '').replace(/\s+/g, ' ');
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'outcome';
const genericRouteLabel = /^(?:output|route|branch|path)\s*\d+$/i;
const fanOutLanguage = /\b(?:same|all|both|every)\b[\s\S]*\b(?:to|across)\b/i;
const collectionLanguage = /\b(?:for each|each item|every item|attachments?|rows?|collection)\b/i;

const splitOutcomeLabels = (text: string): string[] => {
  const cleaned = cleanPart(text).replace(/^(?:and|or)\s+/i, '');
  const commaParts = cleaned.split(/\s*,\s*/);
  const parts = commaParts.length > 1
    ? commaParts.flatMap((part, index) => index === commaParts.length - 1 ? part.split(/^\s*(?:and|or)\s+/i) : [part])
    : cleaned.split(/\s+(?:or|and)\s+/i);
  return parts.map((part) => cleanPart(part.replace(/^(?:and|or)\s+/i, ''))).filter(Boolean);
};

const inferRoutingBasis = (subject: string, labels: readonly string[]): string | undefined => {
  const explicit = subject.match(/\b(?:based on|by|according to)\s+(.+)$/i)?.[1];
  if (explicit) return cleanPart(explicit);
  const normalized = labels.map((label) => label.toLowerCase());
  if (normalized.every((label) => /\b(?:paid|pending|overdue|unpaid|cancelled|completed)\b/.test(label))) return 'status';
  if (normalized.every((label) => /\b(?:high|medium|low)\b/.test(label))) return 'priority';
  if (normalized.some((label) => /\b(?:it|marketing|support|sales|finance|legal|operations|hr)\b/.test(label))) return 'department';
  if (normalized.some((label) => /\b(?:north|south|east|west|emea|apac|americas)\b/.test(label))) return 'region';
  return undefined;
};

const hasOverlappingLabels = (labels: readonly string[]) => labels.some((label, index) => labels.some((other, otherIndex) => {
  if (index === otherIndex) return false;
  const left = label.toLowerCase();
  const right = other.toLowerCase();
  return left === right || left.includes(right) || right.includes(left);
}));

interface RouterMatch {
  subject: string;
  basis?: string;
  labels: string[];
  targets?: string[];
}

const matchRouterScope = (scope: SourceScope): RouterMatch | undefined => {
  if (fanOutLanguage.test(scope.text) || collectionLanguage.test(scope.text)) return undefined;

  const priorityMatches = [...scope.text.matchAll(/\b(high|medium|low)\s+priority\s+cases?\s+to\s+([^,;.]+?)(?=\s*,\s*(?:and\s+)?(?:high|medium|low)\s+priority|[.;]|$)/gi)];
  if (priorityMatches.length >= 3 && /^send\b/i.test(scope.text)) {
    return {
      subject: 'priority cases', basis: 'priority',
      labels: priorityMatches.map((match) => `${match[1]![0]!.toUpperCase()}${match[1]!.slice(1).toLowerCase()} Priority`),
      targets: priorityMatches.map((match) => cleanPart(match[2]!)),
    };
  }

  const explicit = scope.text.match(/^\s*(?:please\s+)?(route|categorize|classify|direct|assign|distribute)\s+(.+?)\s+(?:to|as|into|among)\s+(.+?)[.!?]?\s*$/i);
  if (!explicit) return undefined;
  const labels = splitOutcomeLabels(explicit[3]!);
  if (labels.length < 3 || labels.some((label) => genericRouteLabel.test(label))) return undefined;
  const subject = cleanPart(explicit[2]!);
  const basis = inferRoutingBasis(subject, labels);
  return basis ? { subject, basis, labels } : { subject, labels };
};

const buildRouterResult = (sourceRequirement: string, detectorId: string, detectorVersion: string, matches: Array<{ scope: SourceScope; match: RouterMatch }>): CapabilityDetectionResult => {
  if (matches.length === 0) return createEmptyCapabilityDetectionResult(sourceRequirement, detectorId, detectorVersion);
  const evidence: CapabilityDetectionEvidence[] = [];
  const ambiguities: CapabilityDetectionAmbiguity[] = [];
  const candidates: CapabilityDetectionCandidate[] = [];
  const unresolvedQuestions: string[] = [];

  for (const { scope, match } of matches) {
    const scopeKey = `${scope.start}-${scope.end}`;
    const evidenceId = `router-evidence-${scopeKey}`;
    evidence.push({ id: evidenceId, sourceText: scope.text, sourceStart: scope.start, sourceEnd: scope.end, explanation: `The source states routing for ${match.subject} across ${match.labels.length} business outcomes.` });
    const ambiguityIds: string[] = [];
    if (!match.basis) {
      const id = `router-basis-ambiguity-${scopeKey}`;
      const question = `Which business attribute determines the route for ${match.subject}?`;
      ambiguities.push({ id, description: `The routing basis for ${match.subject} is not explicit.`, severity: 'high', clarificationQuestion: question, affectedEvidenceIds: [evidenceId] });
      ambiguityIds.push(id);
      unresolvedQuestions.push(question);
    }
    if (hasOverlappingLabels(match.labels)) {
      const id = `router-overlap-ambiguity-${scopeKey}`;
      const question = `How should overlapping outcomes for ${match.subject} be distinguished?`;
      ambiguities.push({ id, description: `Some stated route outcomes for ${match.subject} overlap.`, severity: 'high', clarificationQuestion: question, affectedEvidenceIds: [evidenceId] });
      ambiguityIds.push(id);
      unresolvedQuestions.push(question);
    }
    const basis = match.basis ?? 'an unresolved business attribute';
    const routeHints = match.labels.map((label, index) => ({
      entityType: 'route' as const,
      temporaryId: `router-route-${scope.start}-${index + 1}-${slug(label)}`,
      description: match.targets?.[index]
        ? `The ${label} outcome leads to ${match.targets[index]}.`
        : `The ${label} outcome for ${match.subject}.`,
    }));
    candidates.push({
      id: `router-candidate-${scopeKey}`,
      nodeFunctionId: 'router',
      name: `Route ${match.subject} by ${basis}`,
      explanation: `Route ${match.subject} by ${basis} to the stated semantic outcomes: ${match.labels.join(', ')}.`,
      evidenceIds: [evidenceId],
      confidence: ambiguityIds.length > 0
        ? { score: 0.72, level: 'medium', reason: 'Multiple outcomes are explicit, but routing semantics require clarification.' }
        : { score: 0.96, level: 'high', reason: 'Routing language, basis, and at least three outcomes are explicit.' },
      ambiguityIds,
      suggestedReviewState: 'required',
      relatedEntityHints: [
        { entityType: 'decision', temporaryId: `router-decision-${scope.start}`, description: `A multi-outcome business decision for ${match.subject}.` },
        ...routeHints,
      ],
      metadata: { scope: `${scope.start}:${scope.end}`, requirementBasis: 'explicit', routingBasis: basis, routeLabels: match.labels.join(' | ') },
    });
  }

  return parseCapabilityDetectionResult({ schemaVersion: CAPABILITY_DETECTION_SCHEMA_VERSION, sourceRequirement, detectorId, detectorVersion, candidates, evidence, ambiguities, warnings: [], unresolvedQuestions });
};

export class RouterDetector implements NodeFunctionDetector {
  readonly id = 'deterministic-router-detector';
  readonly version = '1.0';
  readonly supportedNodeFunctionIds = Object.freeze(['router'] as const);

  detect(input: NodeFunctionDetectorInput): CapabilityDetectionResult {
    const parsed = nodeFunctionDetectorInputSchema.parse(input);
    const matches = statementScopes(parsed.sourceRequirement)
      .map((scope) => ({ scope, match: matchRouterScope(scope) }))
      .filter((item): item is { scope: SourceScope; match: RouterMatch } => Boolean(item.match));
    return buildRouterResult(parsed.sourceRequirement, this.id, this.version, matches);
  }
}

interface BinaryMatch {
  condition: string;
  positiveAction: string;
  alternateAction: string;
  labels: readonly [string, string];
}

const semanticBinaryLabels = (condition: string): readonly [string, string] => {
  if (/\bapprov(?:ed|al|es?)\b/i.test(condition)) return ['Approved', 'Rejected'];
  if (/\bvalid\b/i.test(condition)) return ['Valid', 'Invalid'];
  if (/\b(?:succeed|succeeds|successful|success)\b/i.test(condition)) return ['Success', 'Failure'];
  if (/\binterested\b/i.test(condition)) return ['Interested', 'Not Interested'];
  if (/\b(?:available|present|exists?)\b/i.test(condition)) return ['Available', 'Unavailable'];
  return ['TRUE', 'FALSE'];
};

const matchBinaryScope = (scope: SourceScope): BinaryMatch | undefined => {
  if (fanOutLanguage.test(scope.text) || collectionLanguage.test(scope.text)) return undefined;
  const match = scope.text.match(/^\s*(?:if|when)\s+(.+?)\s*,\s*(.+?)(?:\s*;\s*|\.\s*)(otherwise|else|if\s+not)\s*,?\s*(.+?)[.!?]?\s*$/i);
  if (!match) return undefined;
  const condition = cleanPart(match[1]!);
  const positiveAction = cleanPart(match[2]!);
  const alternateAction = cleanPart(match[4]!);
  if (!condition || !positiveAction || !alternateAction) return undefined;
  if (/^if\b/i.test(alternateAction) || /\b(?:otherwise|else)\b/i.test(alternateAction)) return undefined;
  return { condition, positiveAction, alternateAction, labels: semanticBinaryLabels(condition) };
};

const buildBinaryResult = (sourceRequirement: string, detectorId: string, detectorVersion: string, matches: Array<{ scope: SourceScope; match: BinaryMatch }>): CapabilityDetectionResult => {
  if (matches.length === 0) return createEmptyCapabilityDetectionResult(sourceRequirement, detectorId, detectorVersion);
  const evidence: CapabilityDetectionEvidence[] = [];
  const candidates: CapabilityDetectionCandidate[] = [];
  for (const { scope, match } of matches) {
    const scopeKey = `${scope.start}-${scope.end}`;
    const evidenceId = `binary-decision-evidence-${scopeKey}`;
    evidence.push({ id: evidenceId, sourceText: scope.text, sourceStart: scope.start, sourceEnd: scope.end, explanation: `The source states a condition and an explicit alternate business outcome.` });
    candidates.push({
      id: `binary-decision-candidate-${scopeKey}`,
      nodeFunctionId: 'binary-decision',
      name: `Decide whether ${match.condition}`,
      explanation: `Evaluate ${match.condition}; ${match.labels[0]} leads to ${match.positiveAction}, while ${match.labels[1]} leads to ${match.alternateAction}.`,
      evidenceIds: [evidenceId],
      confidence: { score: 0.97, level: 'high', reason: 'The condition and both alternate actions are explicit.' },
      ambiguityIds: [],
      suggestedReviewState: 'required',
      relatedEntityHints: [
        { entityType: 'decision', temporaryId: `binary-decision-${scope.start}`, description: `A two-outcome business decision evaluating ${match.condition}.` },
        { entityType: 'route', temporaryId: `binary-route-${scope.start}-1-${slug(match.labels[0])}`, description: `${match.labels[0]}: ${match.positiveAction}.` },
        { entityType: 'route', temporaryId: `binary-route-${scope.start}-2-${slug(match.labels[1])}`, description: `${match.labels[1]}: ${match.alternateAction}.` },
      ],
      metadata: {
        scope: `${scope.start}:${scope.end}`, requirementBasis: 'explicit', condition: match.condition,
        routeLabels: match.labels.join(' | '), positiveAction: match.positiveAction, alternateAction: match.alternateAction,
      },
    });
  }
  return parseCapabilityDetectionResult({ schemaVersion: CAPABILITY_DETECTION_SCHEMA_VERSION, sourceRequirement, detectorId, detectorVersion, candidates, evidence, ambiguities: [], warnings: [], unresolvedQuestions: [] });
};

export class BinaryDecisionDetector implements NodeFunctionDetector {
  readonly id = 'deterministic-binary-decision-detector';
  readonly version = '1.0';
  readonly supportedNodeFunctionIds = Object.freeze(['binary-decision'] as const);

  detect(input: NodeFunctionDetectorInput): CapabilityDetectionResult {
    const parsed = nodeFunctionDetectorInputSchema.parse(input);
    const matches = statementScopes(parsed.sourceRequirement)
      .map((scope) => ({ scope, match: matchBinaryScope(scope) }))
      .filter((item): item is { scope: SourceScope; match: BinaryMatch } => Boolean(item.match));
    return buildBinaryResult(parsed.sourceRequirement, this.id, this.version, matches);
  }
}
