import { z } from 'zod';

const textSchema = z.string().trim().min(1);
export const semanticWaitFactSchema = z.object({
  id: textSchema,
  evidenceText: textSchema,
  sourceStart: z.number().int().nonnegative(),
  sourceEnd: z.number().int().positive(),
  waitType: z.enum(['duration', 'until-date', 'until-event', 'until-response', 'until-approval']),
  boundaryDescription: textSchema,
  durationDescription: textSchema.optional(),
  dateDescription: textSchema.optional(),
  eventDescription: textSchema.optional(),
  timeoutOutcome: textSchema.optional(),
  confidenceReason: textSchema,
  completeness: z.enum(['complete', 'needs-clarification']),
}).strict();

export type SemanticWaitFact = z.infer<typeof semanticWaitFactSchema>;

interface SourceClause { text: string; start: number; end: number }
type FactDetails = Omit<SemanticWaitFact, 'id' | 'evidenceText' | 'sourceStart' | 'sourceEnd'>;

const clausesFor = (source: string): SourceClause[] => {
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
const durationSource = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten)\\s+(?:business\\s+)?(?:seconds?|minutes?|hours?|days?|weeks?|months?)';
const recurring = /\b(?:every|each)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)?\s*(?:seconds?|minutes?|hours?|days?|weeks?|months?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const pollingRetryOrReminder = /\b(?:check|poll|retry|remind|reminder)\b/i;
const schedule = /^\s*(?:run|start|schedule)\b/i;
const historicalTiming = /\b(?:replied|responded|was received|arrived|completed)\s+after\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i;

const timeoutAction = (value: string) => clean(value)
  .replace(/^escalating\b/i, 'escalate')
  .replace(/^processing\b/i, 'process');

const priorApprovalEvent = (prior: SourceClause | undefined, fallback: string) => {
  const role = prior?.text.match(/\b(?:a|the)\s+(.+?)\s+must\s+approve\b/i)?.[1];
  return role ? `${clean(role)} approval` : fallback;
};

const matchSemanticWait = (clause: SourceClause, prior?: SourceClause): FactDetails | undefined => {
  if (recurring.test(clause.text) || pollingRetryOrReminder.test(clause.text) || schedule.test(clause.text) || historicalTiming.test(clause.text) || /\bfor later\b/i.test(clause.text)) return undefined;
  const body = clause.text.replace(/[.!?]+$/, '');

  let match = body.match(new RegExp(`^if\\s+(.+?)\\s+is\\s+not\\s+received\\s+within\\s+(${durationSource})\\s*,\\s*(.+)$`, 'i'));
  if (match) {
    const duration = clean(match[2]!);
    const approval = /approval/i.test(match[1]!);
    const event = approval ? priorApprovalEvent(prior, clean(match[1]!)) : clean(match[1]!);
    return {
      waitType: approval ? 'until-approval' : /response|reply/i.test(event) ? 'until-response' : 'until-event',
      boundaryDescription: `${event} within ${duration}`,
      durationDescription: duration,
      eventDescription: event,
      timeoutOutcome: timeoutAction(match[3]!),
      confidenceReason: 'The requirement explicitly states an unmet event, a maximum duration, and timeout handling.',
      completeness: 'complete',
    };
  }

  match = body.match(new RegExp(`^allow\\s+(?:the\\s+)?(.+?)\\s+(${durationSource})\\s+to\\s+(reply|respond)\\s+before\\s+(.+)$`, 'i'));
  if (match) {
    const duration = clean(match[2]!);
    const event = `${clean(match[1]!)} ${match[3]!.toLowerCase()}`;
    return { waitType: 'until-response', boundaryDescription: `${event} within ${duration}`, durationDescription: duration, eventDescription: event, timeoutOutcome: timeoutAction(match[4]!), confidenceReason: 'The requirement grants a bounded response period before explicit alternate handling.', completeness: 'complete' };
  }

  match = body.match(/^(.+?)\s+remains?\s+pending\s+until\s+(?:the\s+)?(.+?)\s+(responds?|replies?)$/i);
  if (match) {
    const event = `${clean(match[2]!)} ${match[3]!.toLowerCase()}`;
    return { waitType: 'until-response', boundaryDescription: event, eventDescription: event, confidenceReason: 'The requirement explicitly keeps work pending until a response.', completeness: 'complete' };
  }

  match = body.match(/^do\s+not\s+(.+?)\s+before\s+(.+?approval)$/i);
  if (match) {
    const event = clean(match[2]!);
    return { waitType: 'until-approval', boundaryDescription: event, eventDescription: event, confidenceReason: 'The requirement blocks work until an explicit approval boundary.', completeness: 'complete' };
  }

  match = body.match(/^continue\s+once\s+(.+?)\s+(?:has\s+been|is)\s+(received|signed|completed)$/i);
  if (match) {
    const event = `${clean(match[1]!)} ${match[2]!.toLowerCase()}`;
    return { waitType: 'until-event', boundaryDescription: event, eventDescription: event, confidenceReason: 'Continuation is explicitly gated by receipt or completion of a business event.', completeness: 'complete' };
  }

  match = body.match(/^hold\s+(.+?)\s+until\s+(.+?(?:due\s+date|deadline|scheduled\s+date|calendar\s+date))$/i);
  if (match) {
    const date = clean(match[2]!);
    return { waitType: 'until-date', boundaryDescription: date, dateDescription: date, confidenceReason: 'The requirement explicitly holds work until a named business date.', completeness: 'complete' };
  }

  match = body.match(new RegExp(`^after\\s+(${durationSource})\\s+without\\s+(?:a\\s+)?(response|reply)\\s*,\\s*(.+)$`, 'i'));
  if (match) {
    const duration = clean(match[1]!);
    const event = clean(match[2]!);
    return { waitType: 'until-response', boundaryDescription: `${event} within ${duration}`, durationDescription: duration, eventDescription: event, timeoutOutcome: timeoutAction(match[3]!), confidenceReason: 'The requirement explicitly states a response timeout and its alternate handling.', completeness: 'complete' };
  }
  return undefined;
};

export function extractSemanticWaitFacts(sourceRequirement: string): SemanticWaitFact[] {
  const clauses = clausesFor(sourceRequirement);
  return clauses.flatMap((clause, index) => {
    const details = matchSemanticWait(clause, clauses[index - 1]);
    if (!details) return [];
    return [semanticWaitFactSchema.parse({
      id: `semantic-wait-fact-${clause.start}-${clause.end}`,
      evidenceText: sourceRequirement.slice(clause.start, clause.end),
      sourceStart: clause.start,
      sourceEnd: clause.end,
      ...details,
    })];
  });
}
