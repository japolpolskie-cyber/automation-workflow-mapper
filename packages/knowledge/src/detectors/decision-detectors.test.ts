import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseCapabilityDetectionResult,
  previewWorkflowBriefDetectionMetadata,
  type NodeFunctionDetector,
} from '../capability-detection.js';
import { hasNodeFunctionContract } from '../node-function-catalog.js';
import { BinaryDecisionDetector, RouterDetector } from './decision-detectors.js';

const routeHints = (result: ReturnType<NodeFunctionDetector['detect']>) => result.candidates[0]?.relatedEntityHints.filter((hint) => hint.entityType === 'route') ?? [];

describe('RouterDetector', () => {
  const detector = new RouterDetector();

  it('detects explicit department routing and preserves semantic labels', () => {
    const sourceRequirement = 'Route requests to IT, Marketing, or Customer Support.';
    const result = detector.detect({ sourceRequirement });
    expect(parseCapabilityDetectionResult(result)).toEqual(result);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ nodeFunctionId: 'router', suggestedReviewState: 'required', metadata: { routingBasis: 'department', routeLabels: 'IT | Marketing | Customer Support' } });
    expect(routeHints(result).map((hint) => hint.description)).toEqual(['The IT outcome for requests.', 'The Marketing outcome for requests.', 'The Customer Support outcome for requests.']);
  });

  it('detects status routing', () => {
    const result = detector.detect({ sourceRequirement: 'Classify invoices as Paid, Pending, or Overdue.' });
    expect(result.candidates[0]).toMatchObject({ nodeFunctionId: 'router', metadata: { routingBasis: 'status', routeLabels: 'Paid | Pending | Overdue' } });
  });

  it('detects repeated priority routing and preserves downstream meanings separately', () => {
    const result = detector.detect({ sourceRequirement: 'Send High Priority cases to escalation, Medium Priority cases to review, and Low Priority cases to the normal queue.' });
    expect(result.candidates[0]).toMatchObject({ nodeFunctionId: 'router', metadata: { routeLabels: 'High Priority | Medium Priority | Low Priority' } });
    expect(routeHints(result).map((hint) => hint.description)).toEqual(['The High Priority outcome leads to escalation.', 'The Medium Priority outcome leads to review.', 'The Low Priority outcome leads to the normal queue.']);
  });

  it('never emits generic route labels', () => {
    expect(detector.detect({ sourceRequirement: 'Route requests to Route 1, Route 2, or Route 3.' }).candidates).toEqual([]);
  });

  it('does not detect exactly two outcomes', () => {
    expect(detector.detect({ sourceRequirement: 'Route requests to IT or Marketing.' }).candidates).toEqual([]);
  });

  it.each([
    'Send the alert to Slack and Email.',
    'Send the same request to Legal, Finance, and Operations for review.',
    'Create a lead, notify sales, and archive the request.',
    'For each attachment, save the file.',
    'Create a Finance ticket.',
  ])('does not detect non-routing behavior: %s', (sourceRequirement) => {
    expect(detector.detect({ sourceRequirement }).candidates).toEqual([]);
  });

  it('adds clarification for overlapping outcomes', () => {
    const result = detector.detect({ sourceRequirement: 'Route enquiries to Sales, Enterprise Sales, or Support.' });
    expect(result.candidates).toHaveLength(1);
    expect(result.ambiguities.some((ambiguity) => /overlap/i.test(ambiguity.description))).toBe(true);
    expect(result.ambiguities[0]?.clarificationQuestion).toBeTruthy();
    expect(result.candidates[0]?.confidence.level).toBe('medium');
  });

  it('adds clarification when the routing basis is unclear', () => {
    const result = detector.detect({ sourceRequirement: 'Route cases to Alpha, Beta, or Gamma.' });
    expect(result.candidates).toHaveLength(1);
    expect(result.ambiguities.some((ambiguity) => /basis/i.test(ambiguity.id))).toBe(true);
    expect(result.unresolvedQuestions).toEqual(['Which business attribute determines the route for cases?']);
  });

  it('uses exact offsets and stable deterministic IDs', () => {
    const input = { sourceRequirement: 'First record the request. Route requests to IT, Marketing, or Support.' };
    const first = detector.detect(input);
    const second = detector.detect(structuredClone(input));
    expect(first).toEqual(second);
    for (const evidence of first.evidence) expect(input.sourceRequirement.slice(evidence.sourceStart, evidence.sourceEnd)).toBe(evidence.sourceText);
  });

  it('does not mutate its input and supports only Router', () => {
    const input = { sourceRequirement: 'Route requests to IT, Marketing, or Support.', businessContext: { owner: 'Operations', tags: ['incoming'] } };
    const before = JSON.stringify(input);
    detector.detect(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(detector.supportedNodeFunctionIds).toEqual(['router']);
  });
});

describe('BinaryDecisionDetector', () => {
  const detector = new BinaryDecisionDetector();

  it.each([
    'If payment succeeds, send a receipt; otherwise notify finance.',
    'If the lead is interested, return to qualification; else end the sequence.',
    'When the record is valid, save it; if not, send it for review.',
  ])('detects an explicit two-way decision: %s', (sourceRequirement) => {
    const result = detector.detect({ sourceRequirement });
    expect(parseCapabilityDetectionResult(result)).toEqual(result);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ nodeFunctionId: 'binary-decision', suggestedReviewState: 'required' });
    expect(routeHints(result)).toHaveLength(2);
  });

  it('preserves semantic outcome labels', () => {
    const result = detector.detect({ sourceRequirement: 'If the lead is interested, return to qualification; otherwise end the sequence.' });
    expect(result.candidates[0]?.metadata?.routeLabels).toBe('Interested | Not Interested');
    expect(routeHints(result).map((hint) => hint.description)).toEqual(['Interested: return to qualification.', 'Not Interested: end the sequence.']);
  });

  it('uses TRUE and FALSE only when no semantic labels are available', () => {
    const fallback = detector.detect({ sourceRequirement: 'If the customer accepts the terms, create the order; otherwise close the request.' });
    expect(fallback.candidates[0]?.metadata?.routeLabels).toBe('TRUE | FALSE');
    const semantic = detector.detect({ sourceRequirement: 'If payment succeeds, send a receipt; otherwise notify finance.' });
    expect(semantic.candidates[0]?.metadata?.routeLabels).toBe('Success | Failure');
  });

  it('preserves both branch actions', () => {
    const result = detector.detect({ sourceRequirement: 'If payment succeeds, send a receipt; otherwise notify finance.' });
    expect(result.candidates[0]?.metadata).toMatchObject({ positiveAction: 'send a receipt', alternateAction: 'notify finance' });
    expect(result.candidates[0]?.explanation).toMatch(/send a receipt.*notify finance/i);
  });

  it.each([
    'If the invoice is valid, save it.',
    'If approved content is available, publish it.',
    'Publish approved content.',
    'Route requests to IT, Marketing, or Customer Support.',
    'Send the same alert to Slack and Email.',
    'If region is North, send to North; else if region is South, send to South; else send to Other.',
  ])('does not detect incomplete, descriptive, parallel, or multi-outcome behavior: %s', (sourceRequirement) => {
    expect(detector.detect({ sourceRequirement }).candidates).toEqual([]);
  });

  it('returns no candidate rather than inventing an implied alternate', () => {
    const result = detector.detect({ sourceRequirement: 'If the request is urgent, escalate it.' });
    expect(result.candidates).toEqual([]);
    expect(result.ambiguities).toEqual([]);
  });

  it('uses exact offsets and stable deterministic IDs', () => {
    const input = { sourceRequirement: 'Record the payment. If payment succeeds, send a receipt. Else notify finance.' };
    const first = detector.detect(input);
    const second = detector.detect(structuredClone(input));
    expect(first).toEqual(second);
    expect(first.candidates).toHaveLength(1);
    for (const evidence of first.evidence) expect(input.sourceRequirement.slice(evidence.sourceStart, evidence.sourceEnd)).toBe(evidence.sourceText);
  });

  it('does not mutate input and supports only Binary Decision', () => {
    const input = { sourceRequirement: 'If payment succeeds, send a receipt; otherwise notify finance.', businessContext: { process: 'Payments' } };
    const before = JSON.stringify(input);
    detector.detect(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(detector.supportedNodeFunctionIds).toEqual(['binary-decision']);
  });
});

describe('decision detector combined safeguards', () => {
  const router = new RouterDetector();
  const binary = new BinaryDecisionDetector();

  it.each([
    'Route requests to IT, Marketing, or Customer Support.',
    'If payment succeeds, send a receipt; otherwise notify finance.',
  ])('does not overlap Router and Binary Decision on one scope: %s', (sourceRequirement) => {
    const results = [router.detect({ sourceRequirement }), binary.detect({ sourceRequirement })];
    expect(results.flatMap((result) => result.candidates)).toHaveLength(1);
  });

  it('preserves separate decision scopes in one requirement', () => {
    const sourceRequirement = 'If payment succeeds, send a receipt; otherwise notify finance. If the lead is interested, qualify it; otherwise close it.';
    const result = binary.detect({ sourceRequirement });
    expect(result.candidates).toHaveLength(2);
    expect(new Set(result.candidates.map((candidate) => candidate.metadata?.scope)).size).toBe(2);
    expect(result.evidence.map((evidence) => evidence.sourceText)).toEqual([
      'If payment succeeds, send a receipt; otherwise notify finance.',
      'If the lead is interested, qualify it; otherwise close it.',
    ]);
  });

  it('produces catalog-backed candidates and valid Workflow Brief previews without full briefs', () => {
    for (const result of [
      router.detect({ sourceRequirement: 'Route requests to IT, Marketing, or Support.' }),
      binary.detect({ sourceRequirement: 'If payment succeeds, send a receipt; otherwise notify finance.' }),
    ]) {
      expect(parseCapabilityDetectionResult(result)).toEqual(result);
      expect(result.candidates.every((candidate) => hasNodeFunctionContract(candidate.nodeFunctionId))).toBe(true);
      const preview = previewWorkflowBriefDetectionMetadata(result, result.candidates[0]!.id);
      expect(preview.capabilitySuggestion).toBeDefined();
      expect(preview).not.toHaveProperty('reviewState');
      expect(preview).not.toHaveProperty('triggers');
      expect(preview.reviewDecision.state).not.toBe('confirmed');
    }
  });

  it('contains no platform, provider, runtime, or full-brief behavior', () => {
    const outputs = [
      router.detect({ sourceRequirement: 'Route requests to IT, Marketing, or Support.' }),
      binary.detect({ sourceRequirement: 'If payment succeeds, send a receipt; otherwise notify finance.' }),
    ];
    expect(JSON.stringify(outputs)).not.toMatch(/n8n|make\.com|zapier|provider|modelId|runtimeConfiguration|lockedAt|lockedBy/i);
    const source = readFileSync(new URL('./decision-detectors.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/CanonicalWorkflowBrief|canonicalWorkflowBriefSchema|from ['"][^'"]*(?:server|client|planner|platforms|provider|desktop)[^'"]*['"]/i);
  });
});
