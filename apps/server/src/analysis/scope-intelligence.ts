import { applicationPacks, canonicalFunctionRegistry, KNOWLEDGE_CATALOG_VERSION, ruleManuals, workflowPatterns, type CanonicalFunctionId, type OperationDefinition } from '@awm/knowledge';
import { applicationRegistry, detectedProcessSummarySchema, type ConfidenceCalculation, type CoverageResult, type DetectedProcessFact, type DeterministicEvidence, type EvidenceType, type ProcessClarification, type ScopeSegment, type DetectedProcessSummary } from '@awm/shared';
import { normalizeBusinessLanguage } from './scope-language-normalizer.js';
import { segmentScope } from './scope-segmentation.js';

export const K3_RULE_VERSION = '1.1.0' as const;
export const K3_SCORING_RULE_ID = 'weighted-evidence-v1' as const;
export const DEFAULT_KNOWLEDGE_BUDGET = 12_000;
const priority: Record<EvidenceType, number> = { explicit: 1, linguistic: 0.8, semantic: 0.75, pattern: 0.7, derived: 0.6, missing_information: 0.5 };
const precedence = ['explicit', 'linguistic', 'semantic', 'pattern', 'derived', 'missing_information'];
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const find = (scope: string, expression: RegExp, offset = 0) => { const match = expression.exec(scope); return match?.[0] ? { text: match[0], start: offset + match.index, end: offset + match.index + match[0].length } : null; };
const segmentFor = (segments: ScopeSegment[], position: number | null) => position === null ? undefined : segments.filter((item) => item.kind === 'clause' && item.start <= position && item.end >= position).sort((a, b) => a.end - a.start - (b.end - b.start))[0] ?? segments.find((item) => item.kind === 'step' && item.start <= position && item.end >= position);

function ev(ruleId: string, category: string, type: EvidenceType, match: ReturnType<typeof find>, explanation: string, confidence: number, weight: number, relationship: DeterministicEvidence['relationship'] = 'supporting', segments: ScopeSegment[] = [], relatedEvidenceIds: string[] = [], supportingFactIds: string[] = []): DeterministicEvidence {
  const segment = segmentFor(segments, match?.start ?? null);
  return { id: `ev-${slug(ruleId)}-${match?.start ?? 'missing'}-${relationship}`, evidenceType: type, relationship, confidence, weight, ruleId, ruleVersion: K3_RULE_VERSION, ruleCategory: category, sourceLocation: { source: 'scope', start: match?.start ?? null, end: match?.end ?? null, ...(segment ? { segmentId: segment.id, stepId: segment.stepId } : {}) }, evidenceText: match?.text ?? `Missing information: ${explanation}`, explanation, relatedEvidenceIds, supportingFactIds };
}

export function calculateEvidenceConfidence(items: readonly DeterministicEvidence[], completenessPenalty = 0): ConfidenceCalculation {
  const weighted = items.map((item) => ({ item, effective: item.weight * priority[item.evidenceType] }));
  const support = weighted.filter(({ item }) => item.relationship === 'supporting').reduce((sum, { item, effective }) => sum + item.confidence * effective, 0);
  const conflict = weighted.filter(({ item }) => item.relationship !== 'supporting').reduce((sum, { item, effective }) => sum + item.confidence * effective, 0);
  const total = weighted.reduce((sum, { effective }) => sum + effective, 0) || 1;
  const finalConfidence = Number((Math.max(0, Math.min(1, (support - conflict) / total)) * (1 - completenessPenalty)).toFixed(4));
  return { scoringRuleId: K3_SCORING_RULE_ID, scoringRuleVersion: K3_RULE_VERSION, precedence, contributingEvidenceIds: items.map((item) => item.id), weightedSupport: Number(support.toFixed(4)), weightedConflict: Number(conflict.toFixed(4)), totalWeight: Number(total.toFixed(4)), completenessPenalty, formula: 'max(0,min(1,(weightedSupport-weightedConflict)/totalWeight))*(1-completenessPenalty)', finalConfidence };
}

const fact = (kind: DetectedProcessFact['kind'], value: string, explanation: string, evidence: DeterministicEvidence[], subject?: DetectedProcessFact['subject'], penalty = 0): DetectedProcessFact => ({ id: `fact-${kind}-${slug(value)}${subject?.segmentId ? `-${subject.segmentId}` : ''}`, kind, value, explanation, evidence, confidence: calculateEvidenceConfidence(evidence, penalty), ...(subject ? { subject } : {}) });
const missing = (category: ProcessClarification['category'], key: string, question: string, reason: string, support: DeterministicEvidence[], segments: ScopeSegment[]): ProcessClarification => { const absent = ev(`clarification.${key}`, 'clarification', 'missing_information', null, reason, 1, 1, 'missing', segments, support.map((item) => item.id)); const evidence = [...support, absent]; return { id: `clarification-${key}`, category, question, reason, missingFact: key.replaceAll('-', ' '), assumptionNotMade: `K3 did not assume ${key.replaceAll('-', ' ')}.`, evidence, confidence: calculateEvidenceConfidence(evidence, 0.2) }; };

const appSources = [...applicationRegistry.map((item) => ({ id: item.id, name: item.name, aliases: item.aliases, legacy: item })), ...applicationPacks.filter((pack) => !applicationRegistry.some((item) => item.id === pack.applicationId)).map((pack) => ({ id: pack.applicationId, name: pack.name, aliases: pack.aliases, legacy: null }))];
const entityNouns = ['lead', 'contact', 'customer', 'employee', 'candidate', 'invoice', 'ticket', 'card', 'item', 'order', 'task', 'subtask', 'folder', 'attachment', 'file', 'row', 'email', 'record', 'message'];
const verbWords = ['create', 'update', 'retrieve', 'find', 'search', 'send', 'notify', 'log', 'wait', 'follow up', 'approve', 'validate', 'upload', 'save', 'process', 'aggregate', 'merge', 'retry', 'escalate'];
const functionRules: { id: string; regex: RegExp; explanation: string; type: EvidenceType }[] = [
  { id: 'data-retrieval', regex: /\b(?:retrieve|fetch|load|get|find|search|look\s*up|lookup|query|read)\b[^,.;]{0,60}\b(?:details?|data|metadata|records?|rows?|entries|items?|tasks?|cards?|customers?|attachments?|files?|emails?|messages?|appointments?|events?|folders?|contacts?|leads?|invoices?|conflicts?|posts?|documents?|profiles?|status(?:es)?)\b/i, explanation: 'Existing data is explicitly retrieved or searched for downstream work.', type: 'explicit' },
  { id: 'notification', regex: /\b(?:notify|alert|remind|inform|message|email)\b(?:\s+(?:the|a|an))?\s+(?:(?:account|project|sales|support|customer|team)\s+)?(?:slack|team|owner|manager|admin|administrator|hr|finance|requester|customer|client|lead|user|channel|recipient)\b|\bsend\b[^,.;]{0,50}\b(?:notification|alert|notice|reminder|confirmation|invitation|summary|rejection)\b/i, explanation: 'A person or channel is explicitly informed about an event or required action.', type: 'explicit' },
  { id: 'logging', regex: /\b(?:log|record|audit|track)\b[^,.;]{0,60}\b(?:results?|outcomes?|completion|events?|execution|activities|entries|items?|records?|rows?|payments?|invoices?|attachments?|history|audit trail)\b|\blog\s+it\s+in\s+google sheets\b|\b(?:add|append|write)\b[^,.;]{0,40}\b(?:rows?|entries|history|audit trail)\b(?:[^,.;]{0,40}\b(?:google sheets|spreadsheet|sheet|table|log)\b)?/i, explanation: 'Execution evidence or a business result is explicitly recorded for reporting or audit.', type: 'explicit' },
  { id: 'validation', regex: /\b(?:validate|verify|check|ensure|confirm)\b(?:\s+(?:the|a|an|that))?\s+(?:email|address|inventory|stock|data|input|fields?|format|amount|value|record|registration|invoice|request|payload|availability|required fields?)\b/i, explanation: 'Input data or a required business value is explicitly checked before continuing.', type: 'explicit' },
  { id: 'human-approval', regex: /\b(?:request|require|seek|obtain|await|needs?)\s+(?:(?:a|an|the)\s+)?(?:(?:human|manager|finance|hr|owner|supervisor)\s+)?approval\b|\b(?:manager|finance|hr|owner|supervisor|reviewer)\b[^,.;]{0,40}\b(?:approve|reject|review)\b|\bwhen\b[^,.;]{0,80}\b(?:is|was|becomes?|gets?)\s+approved\b/i, explanation: 'A person or role must approve or reject the work before the workflow continues.', type: 'explicit' },
  { id: 'action', regex: /\b(?:create|update|upload|fulfill|schedule|archive|move|mark|save|send)\b[^,.;]{0,70}\b(?:project|task|subtask|folder|file|record|lead|contact|customer|order|event|email|message|newsletter|invitation|confirmation|summary|status|row)\b/i, explanation: 'An external application record, file, message, or business object is explicitly changed or created.', type: 'explicit' },
  { id: 'filter', regex: /\b(?:discard|drop|ignore|stop)\s+(?:the\s+)?(?:invalid|unmatched|nonmatching)|\bcontinue only\b/i, explanation: 'Unmatched records stop without a visible alternate action.', type: 'semantic' },
  { id: 'merge', regex: /\bmerge\s+(?:all\s+)?(?:routes|branches|paths)|\brejoin\b/i, explanation: 'Branches explicitly rejoin into one workflow path.', type: 'explicit' },
  { id: 'aggregator', regex: /\baggregate\b|\bcombine all .{0,30}(?:results|items)\b|\bone summary\b/i, explanation: 'Multiple item results are combined into one output.', type: 'explicit' },
  { id: 'retry', regex: /\bretr(?:y|ies|ied)\b|\btry again\b/i, explanation: 'A failed operation is attempted again.', type: 'explicit' },
  { id: 'error-handler', regex: /\b(?:if|when|after) (?:it |the .{0,30})?(?:fails?|errors?)\b|\bfinal failure\b/i, explanation: 'Failure has an explicit handling path.', type: 'semantic' },
  { id: 'delay', regex: /\bwait\s+(?:(?:for|until)\s+)?(?:(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:minutes?|hours?|days?|weeks?)|[^,.;]{1,50}\b(?:response|approval|event|date|time)\b)|\b(?:pause|delay(?:\s+processing)?)\s+until\s+[^,.;]{1,70}\b(?:repl(?:y|ies)|responds?|response|approval|approved|event|date|time)\b|\bresume\s+after\s+[^,.;]{1,60}\b(?:repl(?:y|ies)|response|approval|approved|event)\b|\b(?:after|in)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:minutes?|hours?|days?|weeks?)\b|\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:minutes?|hours?|days?|weeks?)\s+(?:before|after)\b/i, explanation: 'Execution pauses until an explicit duration, time, or resume event.', type: 'explicit' },
  { id: 'loop', regex: /\buntil\b|\brepeat\b|\bretry up to\b|\bacross every page\b/i, explanation: 'A bounded or conditional repetition cycle is explicit.', type: 'semantic' },
];

export class ScopeIntelligenceService {
  public constructor(private readonly maximumCharacters = DEFAULT_KNOWLEDGE_BUDGET) {}
  public analyze(scope: string, now = new Date()): DetectedProcessSummary {
    const segments = segmentScope(scope); const facts: DetectedProcessFact[] = []; const clarifications: ProcessClarification[] = [];
    const steps = segments.filter((item) => item.kind === 'step');
    const units = steps.flatMap((step) => { const clauses = segments.filter((item) => item.kind === 'clause' && item.stepId === step.id); return clauses.length ? clauses : [step]; });

    for (const app of appSources) {
      const names = [app.name, ...app.aliases].filter((name) => name.length >= 3);
      const match = names.map((name) => find(scope, new RegExp(`\\b${escape(name).replace(/\\s+/g, '\\s+')}\\b`, 'i'))).find(Boolean) ?? null;
      if (match) facts.push(fact('application', app.name, `The complete application registry resolves this phrase to ${app.name}.`, [ev(`application.${app.id}`, 'application', 'explicit', match, `Exact registered name or alias resolves to ${app.id}.`, 0.99, 5, 'supporting', segments)]));
    }

    for (const unit of units) {
      for (const noun of entityNouns) { const match = find(unit.text, new RegExp(`\\b${noun}(?:s)?\\b`, 'i'), unit.start); if (match && !facts.some((item) => item.kind === 'entity' && item.value === noun && item.subject?.stepId === unit.stepId)) facts.push(fact('entity', noun, `The ${noun} entity is explicit in this step.`, [ev(`entity.${noun}`, 'entity', 'explicit', match, 'The entity noun occurs directly in this clause.', 0.97, 4, 'supporting', segments)], { entityId: noun, segmentId: unit.id, stepId: unit.stepId })); }
      for (const verb of verbWords) { const match = find(unit.text, new RegExp(`\\b${escape(verb).replace('\\ ', '[ -]?')}(?:s|d|ing)?\\b`, 'i'), unit.start); if (match && !facts.some((item) => item.kind === 'business_verb' && item.value === verb && item.subject?.stepId === unit.stepId)) facts.push(fact('business_verb', verb, `The step explicitly uses “${verb}”.`, [ev(`verb.${slug(verb)}`, 'business-verb', 'explicit', match, 'The business verb occurs directly in this clause.', 0.98, 4, 'supporting', segments)], { entityId: null, segmentId: unit.id, stepId: unit.stepId })); }

      const collection = find(unit.text, /\b(?:for each|each|every|all|multiple|collection of)\s+(?:approved\s+)?(?!minute|hour|day|week|month)([a-z][a-z-]*)|\battachments\b|\baggregate\s+(?:the\s+)?(?:entries|items|rows|records|links)\b/i, unit.start);
      const singleMatches = [...unit.text.matchAll(/\b(?:a single|single|one)\s+(?:[a-z][a-z-]+\s+)?(contact|customer|employee|candidate|invoice|ticket|card|item|order|task|subtask|folder|attachment|file|row|email|record|message|lead)\b/gi)].map((match) => ({ text: match[0], start: unit.start + (match.index ?? 0), end: unit.start + (match.index ?? 0) + match[0].length }));
      if (collection) {
        const entity = (collection.text.match(/(?:for each|each|every|all|multiple|collection of)\s+(?:approved\s+)?([a-z][a-z-]*)/i)?.[1]
          ?? collection.text.match(/aggregate\s+(?:the\s+)?([a-z][a-z-]*)/i)?.[1]
          ?? (collection.text.toLowerCase().includes('attachment') ? 'attachment' : 'item')).replace(/s$/, '');
        const evidence = [ev('cardinality.collection', 'cardinality', 'linguistic', collection, `The quantifier applies to the ${entity} entity, not to scheduling frequency.`, 0.95, 3, 'supporting', segments)];
        const conflictingSingle = singleMatches.find((item) => item.text.toLowerCase().includes(entity));
        if (conflictingSingle) evidence.push(ev('cardinality.single-conflict', 'cardinality', 'explicit', conflictingSingle, `The same ${entity} is also described as single in this clause.`, 0.98, 5, 'conflicting', segments, evidence.map((item) => item.id)));
        facts.push(fact('cardinality', 'collection', `Collection cardinality is scoped to ${entity}.`, evidence, { entityId: entity, segmentId: unit.id, stepId: unit.stepId }));
        facts.push(fact('workflow_function', 'iterator', `Iterate over the detected ${entity} collection.`, [ev('function.iterator', 'workflow-function', 'derived', collection, 'Iterator is derived from entity-scoped collection evidence.', 0.92, 3, 'supporting', segments, evidence.map((item) => item.id))], { entityId: entity, segmentId: unit.id, stepId: unit.stepId }));
        if (evidence.some((item) => item.relationship === 'conflicting')) clarifications.push(missing('cardinality', `collection-versus-single-${slug(entity)}`, `Should this step process one ${entity} or a collection?`, `The same ${entity} has conflicting cardinality in one clause.`, evidence, segments));
      }
      for (const single of singleMatches) { const entity = single.text.split(/\s+/).at(-1)!.replace(/s$/, ''); facts.push(fact('cardinality', 'single', `Single cardinality is scoped to ${entity}.`, [ev(`cardinality.single.${entity}`, 'cardinality', 'explicit', single, `One ${entity} does not justify iteration.`, 0.98, 5, 'supporting', segments)], { entityId: entity, segmentId: unit.id, stepId: unit.stepId })); }

      for (const rule of functionRules) {
        const matches = rule.id === 'action'
          ? [...unit.text.matchAll(new RegExp(rule.regex.source, `${rule.regex.flags.replace('g', '')}g`))].map((match) => ({ text: match[0], start: unit.start + (match.index ?? 0), end: unit.start + (match.index ?? 0) + match[0].length }))
          : [find(unit.text, rule.regex, unit.start)].filter((match): match is NonNullable<typeof match> => Boolean(match));
        for (const match of matches) {
          const detected = fact('workflow_function', rule.id, rule.explanation, [ev(`function.${rule.id}`, 'workflow-function', rule.type, match, rule.explanation, rule.type === 'explicit' ? 0.98 : 0.92, rule.type === 'explicit' ? 5 : 3, 'supporting', segments)], { entityId: null, segmentId: unit.id, stepId: unit.stepId });
          if (rule.id === 'action') detected.id = `${detected.id}-${match.start}`;
          facts.push(detected);
        }
      }
    }

    const normalizedLanguage = normalizeBusinessLanguage(scope);
    const addNormalizedFunction = (value: string, concept: (typeof normalizedLanguage.concepts)[number], explanation: string, entityId: string | null = null) => {
      const segment = segmentFor(segments, concept.start);
      if (facts.some((item) => item.kind === 'workflow_function' && item.value === value && (!segment || item.subject?.stepId === segment.stepId))) return;
      const evidence = ev(concept.ruleId, 'language-normalization', 'linguistic', { text: concept.phrase, start: concept.start, end: concept.end }, `${concept.explanation} Original wording is retained as evidence.`, 0.94, 3, 'supporting', segments);
      facts.push(fact('workflow_function', value, explanation, [evidence], segment ? { entityId, segmentId: segment.id, stepId: segment.stepId } : undefined));
    };
    for (const concept of normalizedLanguage.concepts) {
      if (concept.concept === 'human-approval') addNormalizedFunction('human-approval', concept, 'A deterministic approval synonym identifies a human approval boundary.');
      if (concept.concept === 'notification') addNormalizedFunction('notification', concept, 'A deterministic communication synonym identifies a notification operation.');
      if (concept.concept === 'validation') addNormalizedFunction('validation', concept, 'A deterministic data-check expression identifies validation.');
      if (concept.concept === 'delay') addNormalizedFunction('delay', concept, 'A deterministic temporal expression identifies a delay boundary.');
      if (concept.concept === 'aggregator') addNormalizedFunction('aggregator', concept, 'An explicit many-to-one expression identifies aggregation.');
      if (concept.concept === 'collection') {
        const entity = concept.phrase.match(/\b(?:for each|each|every|all)\s+(?:the\s+)?([a-z][a-z-]*)/i)?.[1]?.replace(/s$/, '') ?? 'item';
        const segment = segmentFor(segments, concept.start);
        const alreadyScoped = facts.some((item) => item.kind === 'cardinality' && item.value === 'collection' && item.subject?.entityId === entity && (!segment || item.subject?.stepId === segment.stepId));
        if (!alreadyScoped) {
          const evidence = ev(concept.ruleId, 'language-normalization', 'linguistic', { text: concept.phrase, start: concept.start, end: concept.end }, `${concept.explanation} Collection cardinality is scoped to ${entity}.`, 0.95, 3, 'supporting', segments);
          facts.push(fact('cardinality', 'collection', `Collection cardinality is scoped to ${entity}.`, [evidence], segment ? { entityId: entity, segmentId: segment.id, stepId: segment.stepId } : undefined));
        }
      }
      if (concept.concept === 'binary-condition') {
        if (!facts.some((item) => item.kind === 'decision' && item.value === 'binary-condition')) {
          const evidence = ev(concept.ruleId, 'language-normalization', 'semantic', { text: concept.phrase, start: concept.start, end: concept.end }, concept.explanation, 0.93, 3, 'supporting', segments);
          facts.push(fact('decision', 'binary-condition', 'The normalized expression has exactly two stated outcomes.', [evidence]));
        }
        addNormalizedFunction('binary-condition', concept, 'Compile the explicit two-outcome expression as a binary condition.');
      }
      if (concept.concept === 'multi-route-decision' && concept.routes.length >= 3) {
        const evidence = ev(concept.ruleId, 'language-normalization', 'semantic', { text: concept.phrase, start: concept.start, end: concept.end }, `${concept.explanation} ${concept.routes.length} routes are explicitly named.`, 0.94, 3, 'supporting', segments);
        if (!facts.some((item) => item.kind === 'decision' && item.value === 'multi-route-decision')) facts.push(fact('decision', 'multi-route-decision', 'An explicit routing dimension selects among at least three named paths.', [evidence]));
        addNormalizedFunction('multi-route-decision', concept, 'Compile the explicitly named alternatives as a deterministic router.');
        for (const routeName of concept.routes) {
          if (facts.some((item) => item.kind === 'route' && item.value.toLowerCase() === routeName.toLowerCase())) continue;
          const routeMatch = find(scope, new RegExp(`\\b${escape(routeName)}\\b`, 'i'));
          facts.push(fact('route', routeName, `Named route: ${routeName}.`, [ev(`${concept.ruleId}.route.${slug(routeName)}`, 'language-normalization', 'explicit', routeMatch, 'The route destination is explicitly named in the original scope.', 0.98, 5, 'supporting', segments)]));
        }
      }
    }

    const binary = find(scope, /(?:did|has|is|was|does|can|should)\s+(?:the\s+)?(?:lead|client|customer|task|record|request|operation|payment|email)[^?\n]{0,80}\?|\b(?:if|whether)\b[^.\n]{0,120}\b(?:responded|replied|approved|rejected|qualified|valid|invalid|clear|blocked|urgent|exists|found|failed|succeeded|successful|complete|completed|exceeds?|above|below)\b|\b(?:if|when)\b[\s\S]{1,180}?\b(?:otherwise|else|if\s+not)\b|\b(?:process|save|create|send|notify|archive|continue|end|update|publish)\b[^.;\n]{1,120}\botherwise\b|\b(?:yes|true|approved|success|successful|continue)\b[^.\n]{0,100}\b(?:no|false|rejected|failure|failed|stop)\b/i);
    if (binary) {
      const evidence = [ev('decision.binary', 'decision', 'semantic', binary, 'The scope expresses exactly two meaningful outcomes such as yes/no, approve/reject, replied/not replied, success/failure, or stop/continue.', 0.93, 3, 'supporting', segments)];
      facts.push(fact('decision', 'binary-condition', 'The predicate has two meaningful business outcomes.', evidence));
      facts.push(fact('workflow_function', 'binary-condition', 'Compile the detected two-outcome predicate as an explicit binary condition.', [ev('function.binary-condition', 'workflow-function', 'derived', binary, 'Binary topology is derived from the explicit two-outcome business predicate.', 0.92, 3, 'supporting', segments, evidence.map((item) => item.id))]));
    }
    const route = find(scope, /(?:based on|depending on|route by)\s+(?:the\s+)?service(?: type)?|\b(?:route|switch|dispatch)\b[^.\n]{0,180}\b(?:by|based on|according to|depending on|status|category|priority|channel|type|department|service|separate|matching|fallback|default)\b/i);
    const routeList = /(?:route|switch|dispatch)\s+(?:by\s+(?:status|category|priority|channel|type|department|service)\s*[:=-]\s*)?([^.;]{1,140}?)\s+(?:requests?|files?|records?|items?|tickets?|messages?|notifications?)?\s+to\s+(?:separate|matching|different)\b/i.exec(scope)?.[1]
      ?? /(?:route|switch)\s+by\s+(?:status|category|priority|channel|type|department|service)\s*[:=-]\s*([^.;]{1,140})/i.exec(scope)?.[1]
      ?? null;
    const namedRoutes = routeList
      ? routeList.split(/\s*,\s*|\s+(?:and|or)\s+/i).map((item) => item.replace(/^(?:(?:and|or)\s+)?(?:(?:the|a|an)\s+)?/i, '').trim()).filter((item) => /^[a-z][a-z0-9 /_-]{1,40}$/i.test(item))
      : [...scope.matchAll(/\b(?:cleaning|maintenance|repair|installation|consulting|design|support)\b/gi)].map((item) => item[0]);
    if (/\b(?:fallback|default|otherwise|unknown route|other)\b/i.test(scope) && !namedRoutes.some((item) => /fallback|default|otherwise|unknown|other/i.test(item))) namedRoutes.push('Default');
    const uniqueRoutes = [...new Set(namedRoutes.map((item) => item.replace(/\s+(?:request|file|record|item|ticket|message|notification)s?$/i, '').trim()).filter(Boolean))];
    if (route && uniqueRoutes.length >= 3) {
      const evidence = [ev('decision.multi-route', 'routing', 'semantic', route, 'Three or more named outcomes require a router or switch rather than a binary condition.', 0.94, 3, 'supporting', segments)];
      facts.push(fact('decision', 'multi-route-decision', 'A status, category, priority, channel, or type selects among at least three named paths.', evidence));
      facts.push(fact('workflow_function', 'multi-route-decision', 'Compile the named alternatives as a deterministic router.', [ev('function.multi-route-decision', 'workflow-function', 'derived', route, 'Router topology is derived from three or more explicit destinations.', 0.92, 3, 'supporting', segments, evidence.map((item) => item.id))]));
      for (const name of uniqueRoutes) facts.push(fact('route', name, `Named route: ${name}.`, [ev(`route.${slug(name)}`, 'routing', 'explicit', find(scope, new RegExp(`\\b${escape(name)}\\b`, 'i')), 'The route or fallback destination is explicitly named.', 0.98, 5, 'supporting', segments)]));
    }

    const repetition = find(scope, /\b(?:repeat|repeated|until|for each|each|retry|follow[ -]?up|reminder)\b/i); if (repetition) facts.push(fact('repetition', 'repeated-work', 'The process includes repeated work.', [ev('repetition.detected', 'repetition', 'linguistic', repetition, 'The phrase is a deterministic repetition signal.', 0.9, 3, 'supporting', segments)]));
    const patternFacts = this.detectPatterns(scope, facts, segments); facts.push(...patternFacts);

    const followUp = patternFacts.find((item) => item.value === 'Follow Up Until Response');
    if (followUp) {
      if (!/\b(?:every|after|wait(?: for)?)\s+\d+\s*(?:minute|hour|day|week)s?\b|\b(?:daily|weekly|monthly)\b/i.test(scope)) clarifications.push(missing('timing', 'follow-up-interval', 'How long should the workflow wait between follow-up attempts?', 'Follow-up behavior is present but no interval is specified.', followUp.evidence, segments));
      if (!/\b(?:(?:maximum|max|up to|no more than)\s+\d+|stop after\s+\d+)\s*(?:attempts?|follow[ -]?ups?|reminders?)\b/i.test(scope)) clarifications.push(missing('repetition', 'maximum-follow-up-attempts', 'What is the maximum number of follow-up attempts?', 'The repeated process has no bounded attempt limit.', followUp.evidence, segments));
      if (!/\b(?:escalate(?:d|s)?|escalation|notify (?:an? )?(?:owner|manager|admin)|manual review|stop after)\b/i.test(scope)) clarifications.push(missing('escalation', 'escalation-policy', 'What should happen after the final unsuccessful attempt?', 'No escalation or terminal policy is specified.', followUp.evidence, segments));
      if (!/\b(?:gmail|email|sms|slack|whatsapp|phone|call)\b/i.test(scope)) clarifications.push(missing('channel', 'communication-channel', 'Which channel should send the follow-up?', 'No communication channel is named.', followUp.evidence, segments));
    }
    const approvalProcess = find(scope, /\b(?:ask|request|require|needs?)\b[^.\n]{0,60}\bapproval\b|\bapproval (?:from|by)\b/i);
    if (approvalProcess && !/\b(?:manager|director|owner|admin|supervisor|team lead|finance|hr)\b[^.\n]{0,40}\b(?:approval|approve)\b|\bapproval (?:from|by)\s+(?:the\s+)?[a-z]/i.test(scope)) clarifications.push(missing('approval', 'approval-owner', 'Who is responsible for approval?', 'An approval action exists but its owner is not named.', [ev('approval.process', 'approval', 'semantic', approvalProcess, 'This is an approval action rather than an Approved status value.', 0.94, 3, 'supporting', segments)], segments));
    if (/\b(?:if|whether)\b/i.test(scope) && !/\b(?:otherwise|else|if no|if not|if rejected|if invalid|on failure|after the final failure)\b/i.test(scope) && !binary) clarifications.push(missing('condition', 'ambiguous-false-path', 'What should happen when the condition is false?', 'A condition exists without a visible unmatched path.', [ev('condition.present', 'decision', 'linguistic', find(scope, /\b(?:if|whether)\b/i), 'Condition language is present.', 0.85, 2, 'supporting', segments)], segments));
    if (/\bcreate\b[^.\n]{0,40}\b(?:record|contact|lead|customer)\b|\bcreate (?:or )?update\b/i.test(scope) && !/\b(?:duplicate|existing|find|search|upsert|create or update)\b/i.test(scope)) clarifications.push(missing('duplicates', 'duplicate-handling-policy', 'How should an existing matching record be handled?', 'Record creation has no duplicate policy.', [ev('create.record', 'duplicates', 'explicit', find(scope, /\bcreate\b[^.\n]{0,40}\b(?:record|contact|lead|customer)\b/i), 'Record creation is explicit.', 0.98, 4, 'supporting', segments)], segments));
    for (const clarification of clarifications) facts.push(fact('uncertainty', clarification.missingFact, clarification.reason, clarification.evidence, undefined, 0.2));

    const coverage = this.coverage(scope, facts); const confidence = facts.filter((item) => item.kind !== 'uncertainty').reduce((sum, item, _, list) => sum + item.confidence.finalConfidence / Math.max(1, list.length), 0); const reliability = { confidence: Number(confidence.toFixed(4)), coverage: coverage.score, overall: Number((confidence * coverage.score).toFixed(4)), formula: 'confidence * coverage' as const };
    const knowledgeContext = this.retrieve(scope, facts, patternFacts, clarifications);
    return detectedProcessSummarySchema.parse({ version: '1.0', feature: 'k3-deterministic-scope-intelligence', shadowMode: true, segments, facts, clarifications, knowledgeContext, coverage, reliability, generatedAt: now.toISOString() });
  }

  private detectPatterns(scope: string, facts: DetectedProcessFact[], segments: ScopeSegment[]): DetectedProcessFact[] {
    const matchers: Record<string, RegExp[]> = {
      'follow-up-until-response': [/follow[ -]?up|reminder/i, /(?:until|unless|check)[^.\n]{0,60}(?:response|respond)|(?:response|respond)[^.\n]{0,50}(?:until|check)/i],
      'create-or-update-record': [/\b(?:create or update|upsert)\b/i, /(?:find|search)[\s\S]{0,140}(?:create|update)/i],
      'process-approved-collection': [/\b(?:approval|approved by|after approval|upon approval|(?:manager|human|reviewer)\s+approv\w*)\b/i, /\b(?:for each|each|all|collection|attachments)\b/i],
      'scheduled-reminder': [/\breminder\b/i, /\b(?:daily|weekly|monthly|every\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d+\s*(?:hours?|days?|weeks?)))\b/i],
      'deduplicate-before-create': [/(?:find|search|check)[\s\S]{0,140}(?:before|then)[\s\S]{0,80}creat/i, /\b(?:duplicate|existing|before creat)\b/i],
      'service-based-routing': [/(?:based on|depending on|route by)\s+(?:the\s+)?service/i, /\b(?:route|path|service type)\b/i],
    }; const output: DetectedProcessFact[] = [];
    for (const pattern of workflowPatterns) { const matches = (matchers[pattern.id] ?? []).map((regex) => find(scope, regex)).filter((item): item is NonNullable<typeof item> => Boolean(item)); if (matches.length < 2) continue; const ordered = [...matches].sort((a, b) => a.start - b.start); const evidence = matches.map((match, index) => ev(`pattern.${pattern.id}.${index + 1}`, 'pattern', 'pattern', match, `Independent signal ${index + 1} for ${pattern.title}.`, 0.9, 2, 'supporting', segments)); const spanStart = ordered[0]!.start; const spanEnd = ordered.at(-1)!.end; const relatedFacts = facts.filter((item) => item.evidence.some((itemEvidence) => itemEvidence.sourceLocation.start !== null && itemEvidence.sourceLocation.start! <= spanEnd + 120 && itemEvidence.sourceLocation.end! >= spanStart - 120)).map((item) => item.id); evidence.push(ev(`pattern.${pattern.id}.derived`, 'pattern', 'derived', { text: scope.slice(spanStart, spanEnd), start: spanStart, end: spanEnd }, `All versioned signals for ${pattern.title} are present.`, 0.92, 2, 'supporting', segments, evidence.map((item) => item.id), relatedFacts)); output.push(fact('pattern', pattern.title, pattern.purpose, evidence)); }
    return output;
  }

  private coverage(scope: string, facts: DetectedProcessFact[]): CoverageResult {
    const required = new Set<string>(); const detected = new Set<string>();
    for (const app of appSources) if ([app.name, ...app.aliases].some((name) => name.length >= 3 && new RegExp(`\\b${escape(name)}\\b`, 'i').test(scope))) required.add(`application:${app.id}`);
    if (/\bwhen\b/i.test(scope)) required.add('trigger'); if (/\b(?:if|whether|otherwise)\b|\?/i.test(scope)) required.add('decision'); if (/\b(?:for each|each|all|single|one)\s+(?!minute|hour|day|week)/i.test(scope)) required.add('cardinality');
    for (const rule of functionRules) if (rule.regex.test(scope)) required.add(`function:${rule.id}`); for (const verb of verbWords) if (new RegExp(`\\b${escape(verb)}`, 'i').test(scope)) required.add(`verb:${slug(verb)}`);
    for (const item of facts) { if (item.kind === 'application') { const source = appSources.find((app) => app.name === item.value); if (source) detected.add(`application:${source.id}`); } if (item.kind === 'decision') detected.add('decision'); if (item.kind === 'cardinality') detected.add('cardinality'); if (item.kind === 'workflow_function') detected.add(`function:${item.value}`); if (item.kind === 'business_verb') detected.add(`verb:${slug(item.value)}`); }
    if (required.has('trigger') && /\bwhen\b/i.test(scope)) detected.add('trigger'); const missingDimensions = [...required].filter((item) => !detected.has(item)); const score = Number((required.size ? (required.size - missingDimensions.length) / required.size : 1).toFixed(4));
    return { requiredDimensions: [...required], detectedDimensions: [...detected].filter((item) => required.has(item)), missingDimensions, score, formula: '(required dimensions - missing dimensions) / required dimensions' };
  }

  private retrieve(scope: string, facts: DetectedProcessFact[], patterns: DetectedProcessFact[], clarifications: ProcessClarification[]): DetectedProcessSummary['knowledgeContext'] {
    const candidates: DetectedProcessSummary['knowledgeContext']['retrieved'] = []; const add = (kind: 'canonical_function' | 'application' | 'operation' | 'pattern' | 'manual', id: string, reason: string, payload: unknown) => candidates.push({ kind, id, reason, estimatedCharacters: JSON.stringify(payload).length });
    const detectedApps = facts.filter((item) => item.kind === 'application').map((item) => item.value);
    for (const name of detectedApps) { const pack = applicationPacks.find((item) => item.name === name); const legacy = applicationRegistry.find((item) => item.name === name); if (pack) add('application', pack.applicationId, 'Exact application evidence selected this K2 pack.', { applicationId: pack.applicationId, name: pack.name, category: pack.category }); else if (legacy) add('application', legacy.id, 'Exact application evidence selected this legacy registry adapter; no K2 operation pack exists.', legacy); }
    const tokens = new Set((scope.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((word) => !['the', 'and', 'then', 'when', 'with', 'into', 'from'].includes(word)));
    for (const pack of applicationPacks.filter((item) => detectedApps.includes(item.name))) for (const operation of pack.operations) { const searchable = `${operation.title} ${operation.purpose} ${operation.operationId}`.toLowerCase(); const score = [...tokens].filter((token) => searchable.includes(token)).length; if (score >= 2 || this.operationVerbMatch(scope, operation)) add('operation', `${pack.applicationId}.${operation.operationId}`, `Deterministic verb/entity matching selected this operation (${score} shared terms).`, operation); }
    const canonicalIds = new Set<CanonicalFunctionId>(); const functionMap: Record<string, CanonicalFunctionId> = { action: 'action', 'data-retrieval': 'data-retrieval', notification: 'notification', logging: 'logging', validation: 'validation', filter: 'filter', iterator: 'iterator', loop: 'loop', merge: 'merge', aggregator: 'aggregator', retry: 'retry', 'error-handler': 'error-handler', delay: 'delay', 'human-approval': 'human-approval', 'binary-condition': 'binary-condition', 'multi-route-decision': 'multi-route-decision' };
    for (const item of facts) { if (item.kind === 'decision' && item.value === 'binary-condition') canonicalIds.add('binary-condition'); if (item.kind === 'decision' && item.value === 'multi-route-decision') canonicalIds.add('multi-route-decision'); if (item.kind === 'workflow_function' && functionMap[item.value]) canonicalIds.add(functionMap[item.value]!); }
    for (const definition of canonicalFunctionRegistry.filter((item) => canonicalIds.has(item.id))) add('canonical_function', definition.id, 'Selected by a first-class detected workflow function.', definition);
    for (const patternFact of patterns) { const definition = workflowPatterns.find((item) => item.title === patternFact.value); if (definition) add('pattern', definition.id, 'All deterministic pattern signals were present.', definition); }
    const manuals = new Set<string>(); if (canonicalIds.has('iterator')) manuals.add('iterator-manual'); if (canonicalIds.has('binary-condition')) manuals.add('binary-condition-manual'); if (canonicalIds.has('multi-route-decision')) manuals.add('multi-route-manual'); if (clarifications.length) manuals.add('clarification-manual'); for (const manual of ruleManuals.filter((item) => manuals.has(item.id))) add('manual', manual.id, 'Selected for a detected semantic fact or open clarification.', manual);
    let used = 0; const retrieved = []; let truncated = false; for (const item of candidates) { if (used + item.estimatedCharacters > this.maximumCharacters) { truncated = true; continue; } retrieved.push(item); used += item.estimatedCharacters; } return { catalogVersion: KNOWLEDGE_CATALOG_VERSION, retrieved, estimatedCharacters: used, maximumCharacters: this.maximumCharacters, truncated };
  }
  private operationVerbMatch(scope: string, operation: OperationDefinition): boolean { const title = operation.title.toLowerCase(); const appNamed = appSources.find((app) => app.id === operation.applicationId)?.name ?? operation.applicationId; if (!scope.toLowerCase().includes(appNamed.toLowerCase()) && !applicationPacks.find((pack) => pack.applicationId === operation.applicationId)?.aliases.some((alias) => scope.toLowerCase().includes(alias))) return false; const verbs = title.match(/^(find|search|create|update|retrieve|send|upload|add|append|lookup|receive)/)?.[1]; return Boolean(verbs && new RegExp(`\\b${verbs}(?:s|d|ing)?\\b`, 'i').test(scope)); }
}
