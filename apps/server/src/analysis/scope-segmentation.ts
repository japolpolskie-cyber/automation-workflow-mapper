import type { ScopeSegment } from '@awm/shared';

const boundary = /[^.!?;\n]+(?:[.!?;]+|$)/g;
const clauseConnector = /\b(?:then|otherwise|else|after that|next)\b|,(?=\s*(?:if|when|unless|while|then)\b)/gi;

export function segmentScope(scope: string): ScopeSegment[] {
  const segments: ScopeSegment[] = [];
  let stepIndex = 0;
  for (const match of scope.matchAll(boundary)) {
    const raw = match[0]; const leading = raw.search(/\S/); if (leading < 0) continue;
    const start = (match.index ?? 0) + leading; const text = raw.trim(); const end = start + text.length;
    const stepId = `step-${++stepIndex}`;
    segments.push({ id: stepId, stepId, kind: 'step', index: segments.length, text, start, end });
    let cursor = 0;
    for (const connector of text.matchAll(clauseConnector)) {
      const cut = connector.index ?? 0; const part = text.slice(cursor, cut).trim();
      if (part) { const local = text.indexOf(part, cursor); segments.push({ id: `${stepId}-clause-${segments.filter((item) => item.stepId === stepId && item.kind === 'clause').length + 1}`, stepId, kind: 'clause', index: segments.length, text: part, start: start + local, end: start + local + part.length }); }
      cursor = cut;
    }
    const part = text.slice(cursor).trim();
    if (part && part !== text) { const local = text.lastIndexOf(part); segments.push({ id: `${stepId}-clause-${segments.filter((item) => item.stepId === stepId && item.kind === 'clause').length + 1}`, stepId, kind: 'clause', index: segments.length, text: part, start: start + local, end: start + local + part.length }); }
  }
  return segments;
}
