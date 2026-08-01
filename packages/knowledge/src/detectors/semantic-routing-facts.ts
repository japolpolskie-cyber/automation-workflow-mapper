import { z } from 'zod';

const textSchema = z.string().trim().min(1);

export const semanticRoutingFactSchema = z.object({
  id: textSchema,
  evidenceText: textSchema,
  sourceStart: z.number().int().nonnegative(),
  sourceEnd: z.number().int().positive(),
  subject: textSchema.optional(),
  routingBasis: textSchema.optional(),
  outcomes: z.array(textSchema).min(3),
  exclusivity: z.enum(['explicit', 'strongly-implied', 'unclear']),
  handlingEvidence: textSchema.optional(),
  confidenceReason: textSchema,
}).strict();

export type SemanticRoutingFact = z.infer<typeof semanticRoutingFactSchema>;

interface SourceClause {
  text: string;
  start: number;
  end: number;
}

interface SemanticMatch {
  subject?: string;
  routingBasis?: string;
  list: string;
  exclusivity: SemanticRoutingFact['exclusivity'];
  reason: string;
}

const boundedClauses = (source: string): SourceClause[] => {
  const clauses: SourceClause[] = [];
  for (const match of source.matchAll(/[^.!?\n]+[.!?]?/g)) {
    const raw = match[0];
    const leading = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (!text) continue;
    const start = (match.index ?? 0) + leading;
    clauses.push({ text, start, end: start + text.length });
  }
  return clauses;
};

const clean = (value: string) => value.trim().replace(/^[,;:\s]+|[,;.!?\s]+$/g, '').replace(/\s+/g, ' ');
const present = (value: string) => value.split(/\s+/).map((word) => /^[A-Z0-9]{2,}$/.test(word) ? word : `${word[0]?.toUpperCase() ?? ''}${word.slice(1).toLowerCase()}`).join(' ');
const genericOutcome = /^(?:option|output|route|branch|path|category|type)\s*\d+$/i;
const fanOut = /\b(?:same|all|both|every)\b[\s\S]*\b(?:to|across)\b/i;
const collection = /\b(?:for each|each item|every item|attachments?|rows?|collection)\b/i;
const basisFromList = (list: string, fallback: string) => {
  if (/\b(?:paid|pending|overdue|unpaid|cancelled|completed)\b/i.test(list)) return 'status';
  if (/\b(?:high|medium|low)\b/i.test(list)) return 'priority';
  return fallback;
};

const outcomesFrom = (value: string): string[] => {
  const list = clean(value);
  if (!/[,;]|\s+or\s+/i.test(list)) return [];
  const outcomes = list
    .replace(/\s+(?:and|or)\s+/gi, ',')
    .split(/\s*[,;]\s*/)
    .map((item) => clean(item.replace(/^(?:and|or)\s+/i, '')))
    .filter(Boolean)
    .map(present);
  const distinct = [...new Map(outcomes.map((outcome) => [outcome.toLowerCase(), outcome])).values()];
  if (distinct.length < 3 || distinct.some((outcome) => genericOutcome.test(outcome) || outcome.split(/\s+/).length > 6)) return [];
  return distinct;
};

const inferredSubject = (prefix: string, captured?: string): string | undefined => {
  const subject = captured ? clean(captured) : undefined;
  if (subject && !/^(?:it|this|that|each one)$/i.test(subject)) return subject;
  const priorObject = prefix.match(/\b(?:review|inspect|read|assess|check)\s+(?:the\s+)?([a-z][a-z -]*?)(?=\s+and\s+|,|$)/i)?.[1];
  return priorObject ? clean(priorObject) : subject;
};

const semanticMatch = (clause: SourceClause): SemanticMatch | undefined => {
  if (fanOut.test(clause.text) || collection.test(clause.text)) return undefined;
  const body = clause.text.replace(/[.!?]+$/, '');

  const relation = body.match(/\bdetermine\s+whether\s+(.+?)\s+(?:is\s+)?(related\s+to|concerns?|belongs\s+to)\s+(.+)$/i)
    ?? body.match(/\bidentify\s+whether\s+(.+?)\s+(belongs\s+to|concerns?|is\s+related\s+to)\s+(.+)$/i);
  if (relation) {
    const prefix = body.slice(0, relation.index ?? 0);
    const subject = inferredSubject(prefix, relation[1]);
    return {
      ...(subject ? { subject } : {}),
      routingBasis: /concern|related/i.test(relation[2]!) ? 'category' : 'category membership',
      list: relation[3]!, exclusivity: /\bor\b/i.test(relation[3]!) ? 'explicit' : 'strongly-implied',
      reason: 'The requirement explicitly asks for one classification among named business outcomes.',
    };
  }

  const which = body.match(/\bidentify\s+(?:whether\s+)?which\s+([a-z][a-z -]*?)(?:\s+applies)?\s*:\s*(.+)$/i);
  if (which) return { routingBasis: clean(which[1]!), list: which[2]!, exclusivity: 'explicit', reason: 'The requirement asks which one of the named business outcomes applies.' };

  const classify = body.match(/\bclassify\s+(.+?)\s+(?:as|into)\s+(.+)$/i);
  if (classify) return { subject: clean(classify[1]!), routingBasis: basisFromList(classify[2]!, 'category'), list: classify[2]!, exclusivity: /\bor\b/i.test(classify[2]!) ? 'explicit' : 'strongly-implied', reason: 'The requirement explicitly classifies one subject into named categories.' };

  const assign = body.match(/\bassign\s+(.+?)\s+according\s+to\s+(.+?)\s*:\s*(.+)$/i);
  if (assign) return { subject: clean(assign[1]!), routingBasis: clean(assign[2]!), list: assign[3]!, exclusivity: /\bor\b/i.test(assign[3]!) ? 'explicit' : 'strongly-implied', reason: 'The requirement assigns one subject according to a named business basis.' };

  const depending = body.match(/\bdepending\s+on\s+(.+?)\s*:\s*(.+)$/i);
  if (depending) return { routingBasis: clean(depending[1]!), list: depending[2]!, exclusivity: /\bor\b/i.test(depending[2]!) ? 'explicit' : 'strongly-implied', reason: 'The requirement makes handling depend on one named business attribute.' };
  return undefined;
};

const handlingFor = (clause: SourceClause | undefined, outcomes: readonly string[]): string | undefined => {
  if (!clause || !/\b(?:send|direct|assign|distribute)\b/i.test(clause.text) || fanOut.test(clause.text)) return undefined;
  const normalized = clause.text.toLowerCase().replace(/-/g, ' ');
  return outcomes.every((outcome) => normalized.includes(outcome.toLowerCase().replace(/-/g, ' '))) ? clause.text : undefined;
};

export function extractSemanticRoutingFacts(sourceRequirement: string): SemanticRoutingFact[] {
  const clauses = boundedClauses(sourceRequirement);
  const facts: SemanticRoutingFact[] = [];
  clauses.forEach((clause, index) => {
    const match = semanticMatch(clause);
    if (!match) return;
    const outcomes = outcomesFrom(match.list);
    if (outcomes.length < 3) return;
    const handlingEvidence = handlingFor(clauses[index + 1], outcomes);
    const end = handlingEvidence ? clauses[index + 1]!.end : clause.end;
    facts.push(semanticRoutingFactSchema.parse({
      id: `semantic-routing-fact-${clause.start}-${end}`,
      evidenceText: sourceRequirement.slice(clause.start, end),
      sourceStart: clause.start,
      sourceEnd: end,
      ...(match.subject ? { subject: match.subject } : {}),
      ...(match.routingBasis ? { routingBasis: match.routingBasis } : {}),
      outcomes,
      exclusivity: match.exclusivity,
      ...(handlingEvidence ? { handlingEvidence } : {}),
      confidenceReason: match.reason,
    }));
  });
  return facts;
}
