export type NormalizedBusinessConcept =
  | 'human-approval'
  | 'rejection'
  | 'notification'
  | 'collection'
  | 'aggregator'
  | 'multi-route-decision'
  | 'delay'
  | 'binary-condition'
  | 'validation';

export interface NormalizedConceptEvidence {
  concept: NormalizedBusinessConcept;
  phrase: string;
  start: number;
  end: number;
  ruleId: string;
  explanation: string;
  routes: string[];
}

export interface NormalizedBusinessLanguage {
  originalText: string;
  concepts: NormalizedConceptEvidence[];
  version: '1.0.0';
}

interface Rule {
  concept: NormalizedBusinessConcept;
  ruleId: string;
  expression: RegExp;
  explanation: string;
}

const rules: Rule[] = [
  { concept: 'human-approval', ruleId: 'normalize.approval', expression: /\b(?:sign(?:ed)?\s+off|sign-?off|authori[sz](?:e|ed|ation)|green-?light(?:ed)?|(?:request|require|seek|obtain|await|needs?)\s+(?:(?:a|an|the)\s+)?(?:[a-z][a-z-]*\s+){0,2}approval|reviewed?\s+by\s+(?:a|an|the)?\s*(?:manager|supervisor|director|owner|coordinator|editor)|(?:manager|supervisor|director|owner|coordinator|editor)\s+(?:review|decision))\b/gi, explanation: 'A named human authorization phrase maps to approval.' },
  { concept: 'rejection', ruleId: 'normalize.rejection', expression: /\b(?:declin(?:e|ed)|turn(?:ed)?\s+down|deny|denied|not\s+approved)\b/gi, explanation: 'A negative authorization phrase maps to rejection.' },
  { concept: 'notification', ruleId: 'normalize.notification', expression: /\b(?:alert|inform|send\s+(?:a\s+)?heads?-?up)\b/gi, explanation: 'A communication verb maps to notification without selecting a provider.' },
  { concept: 'collection', ruleId: 'normalize.collection', expression: /\b(?:for\s+each|each|every|all)\s+(?!day|week|month|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:the\s+)?[a-z][a-z-]*\b/gi, explanation: 'An entity-scoped quantifier maps to collection processing.' },
  { concept: 'aggregator', ruleId: 'normalize.aggregation', expression: /\b(?:combine|summari[sz]e|consolidate|roll\s+up)\s+(?:the\s+)?(?:results?|outcomes?|records?|rows?|entries|links|totals?)\b/gi, explanation: 'An explicit many-to-one result phrase maps to aggregation.' },
  { concept: 'multi-route-decision', ruleId: 'normalize.multi-route', expression: /\b(?:(?:route|switch|dispatch|categorize|classify)(?:d|s|ing)?\s+(?:the\s+\w+\s+|\w+\s+)?(?:based\s+on|by|as)\s+(?:category|priority|channel|status|severity|region|language|department|type)|route\s+[A-Z][^.;]{2,140}\s+to\s+(?:matching|separate|different))\b/gi, explanation: 'An explicit routing dimension maps to a multi-route decision.' },
  { concept: 'delay', ruleId: 'normalize.delay', expression: /\b(?:after\s+(?:a\s+)?(?:period|while)|follow\s+up\s+later|wait(?:\s+for|\s+until)?|in\s+\d+\s+(?:minutes?|hours?|days?|weeks?))\b/gi, explanation: 'An explicit temporal pause maps to delay.' },
  { concept: 'binary-condition', ruleId: 'normalize.binary-condition', expression: /\b(?:if|whether)\s+[^.;]{1,100}\b(?:otherwise|else)\b|\b(?:safe\b[^.;]{0,100}\bunsafe|unsafe\b[^.;]{0,100}\bsafe|valid\b[^.;]{0,100}\binvalid|invalid\b[^.;]{0,100}\bvalid|passing\b[^.;]{0,100}\bfailing|failing\b[^.;]{0,100}\bpassing|active\b[^.;]{0,100}\binactive|inactive\b[^.;]{0,100}\bactive)\b/gi, explanation: 'Two stated business outcomes map to a binary condition.' },
  { concept: 'validation', ruleId: 'normalize.validation', expression: /\b(?:screen|inspect|assess|confirm|verify|check|ensure)\b[^,.;]{0,70}\b(?:details?|fields?|values?|payload|address|identifier|number|quality|stock|inventory|email|data)\b/gi, explanation: 'A domain data-quality check maps to validation.' },
];

const cleanRoute = (value: string) => value.replace(/\b(?:and|or)\b/gi, '').replace(/\s+/g, ' ').trim();

function routesNear(text: string, start: number): string[] {
  const window = text.slice(start, start + 220);
  const list = /(?:category|priority|channel|status|severity|region|language|department|type)\s*[:=-]\s*([^.;]+)/i.exec(window)?.[1]
    ?? /(?:category|priority|channel|status|severity|region|language|department|type)\s+([A-Z][^.;]+?)(?:\s+(?:and\s+)?(?:route|notify|send|merge|combine|to\s+(?:matching|separate|different))|[.;]|$)/.exec(window)?.[1]
    ?? /\broute\s+([A-Z][^.;]+?)\s+(?:students?|requests?|files?|records?|items?|tickets?|messages?|notifications?)?\s+to\s+(?:matching|separate|different)\b/.exec(window)?.[1]
    ?? /\b(?:as|into)\s+([^.;]+?)(?:\s+(?:and|then)\s+(?:route|notify|send|merge|combine)|[.;]|$)/i.exec(window)?.[1];
  if (!list) return [];
  return [...new Set(list.split(/,|\bor\b|\band\b/i).map(cleanRoute).filter((item) => item.length > 1 && item.length < 50))].slice(0, 8);
}

export function normalizeBusinessLanguage(text: string): NormalizedBusinessLanguage {
  const concepts: NormalizedConceptEvidence[] = [];
  for (const rule of rules) {
    for (const match of text.matchAll(rule.expression)) {
      if (match.index === undefined || !match[0]) continue;
      concepts.push({
        concept: rule.concept,
        phrase: match[0],
        start: match.index,
        end: match.index + match[0].length,
        ruleId: rule.ruleId,
        explanation: rule.explanation,
        routes: rule.concept === 'multi-route-decision' ? routesNear(text, match.index) : [],
      });
    }
  }
  return { originalText: text, concepts: concepts.sort((left, right) => left.start - right.start || left.ruleId.localeCompare(right.ruleId)), version: '1.0.0' };
}
