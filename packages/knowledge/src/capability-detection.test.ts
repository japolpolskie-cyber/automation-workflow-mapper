import { readFileSync } from 'node:fs';
import {
  workflowBriefCapabilitySuggestionSchema,
  workflowBriefClarificationQuestionSchema,
  workflowBriefEvidenceSchema,
  workflowBriefReviewDecisionSchema,
} from '@awm/shared';
import { describe, expect, it } from 'vitest';
import * as publicKnowledge from './index.js';
import {
  CAPABILITY_DETECTION_SCHEMA_VERSION,
  NoopNodeFunctionDetector,
  capabilityDetectionCandidateSchema,
  capabilityDetectionConfidenceSchema,
  capabilityDetectionResultSchema,
  createEmptyCapabilityDetectionResult,
  isNodeFunctionDetector,
  nodeFunctionDetectorInputSchema,
  parseCapabilityDetectionResult,
  previewWorkflowBriefDetectionMetadata,
  safeParseCapabilityDetectionResult,
  validateCapabilityDetectionResultAgainstRequirement,
  type CapabilityDetectionResult,
  type NodeFunctionDetector,
} from './capability-detection.js';
import { NODE_FUNCTION_IDS } from './node-function-catalog.js';

const sourceRequirement = 'If the request is approved, continue; otherwise return it for revision.';
const evidenceText = 'If the request is approved, continue; otherwise return it for revision.';

const validResult = (): CapabilityDetectionResult => ({
  schemaVersion: '1.0',
  sourceRequirement,
  detectorId: 'contract-test-detector',
  detectorVersion: '1.0',
  evidence: [{ id: 'decision-evidence', sourceText: evidenceText, sourceStart: 0, sourceEnd: evidenceText.length, explanation: 'The requirement states two alternate business outcomes.' }],
  ambiguities: [{ id: 'approval-authority-ambiguity', description: 'The responsible decision role is not named.', severity: 'blocking', clarificationQuestion: 'Who decides whether the request is approved?', affectedEvidenceIds: ['decision-evidence'] }],
  candidates: [{
    id: 'binary-decision-candidate',
    nodeFunctionId: 'binary-decision',
    name: 'Choose approval outcome',
    explanation: 'The two stated outcomes suggest a binary business decision.',
    evidenceIds: ['decision-evidence'],
    confidence: { score: 0.9, level: 'high', reason: 'Both alternate outcomes are explicitly stated.' },
    ambiguityIds: ['approval-authority-ambiguity'],
    suggestedReviewState: 'suggested',
    relatedEntityHints: [{ entityType: 'decision', temporaryId: 'approval-decision', description: 'A temporary reference for the proposed business decision.' }],
    metadata: { scope: 'request approval outcome', requirementBasis: 'inferred' },
  }],
  warnings: [],
  unresolvedQuestions: ['Who owns the approval decision?'],
});

describe('capability-detection result contract', () => {
  it('accepts a minimum valid result with no candidates', () => {
    const result = createEmptyCapabilityDetectionResult('Receive a request.', 'noop', '1.0');
    expect(parseCapabilityDetectionResult(result)).toEqual(result);
    expect(result).toMatchObject({ schemaVersion: CAPABILITY_DETECTION_SCHEMA_VERSION, candidates: [], evidence: [], ambiguities: [] });
  });

  it('accepts one evidence-bearing catalog candidate', () => {
    expect(parseCapabilityDetectionResult(validResult())).toEqual(validResult());
  });

  it('rejects unknown fields at result and nested boundaries', () => {
    expect(safeParseCapabilityDetectionResult({ ...validResult(), unknown: true }).success).toBe(false);
    const result = validResult() as CapabilityDetectionResult & { candidates: Array<CapabilityDetectionResult['candidates'][number] & { unknown?: boolean }> };
    result.candidates[0]!.unknown = true;
    expect(safeParseCapabilityDetectionResult(result).success).toBe(false);
  });

  it.each([
    [{ score: 0.49, level: 'medium', reason: 'Mismatch.' }, false],
    [{ score: 0.5, level: 'medium', reason: 'Medium boundary.' }, true],
    [{ score: 0.79, level: 'high', reason: 'Mismatch.' }, false],
    [{ score: 0.8, level: 'high', reason: 'High boundary.' }, true],
    [{ score: 1, level: 'high', reason: 'Detection remains unconfirmed.' }, true],
    [{ score: 1, level: 'confirmed', reason: 'Review-only state.' }, false],
  ])('validates the detection confidence band for %j', (confidence, expected) => {
    expect(capabilityDetectionConfidenceSchema.safeParse(confidence).success).toBe(expected);
  });

  it('rejects reversed evidence offsets and mismatched requirement slices', () => {
    const reversed = validResult();
    reversed.evidence[0]!.sourceEnd = 0;
    expect(safeParseCapabilityDetectionResult(reversed).success).toBe(false);
    const mismatch = validResult();
    mismatch.evidence[0]!.sourceText = 'different text';
    expect(safeParseCapabilityDetectionResult(mismatch).success).toBe(false);
    const outOfRange = validResult();
    outOfRange.evidence[0]!.sourceEnd = sourceRequirement.length + 10;
    expect(safeParseCapabilityDetectionResult(outOfRange).success).toBe(false);
  });

  it('rejects unresolved evidence and ambiguity references', () => {
    const evidence = validResult();
    evidence.candidates[0]!.evidenceIds = ['missing-evidence'];
    expect(safeParseCapabilityDetectionResult(evidence).success).toBe(false);
    const ambiguity = validResult();
    ambiguity.candidates[0]!.ambiguityIds = ['missing-ambiguity'];
    expect(safeParseCapabilityDetectionResult(ambiguity).success).toBe(false);
  });

  it('rejects unknown node-function IDs', () => {
    expect(capabilityDetectionCandidateSchema.safeParse({ ...validResult().candidates[0], nodeFunctionId: 'unknown-function' }).success).toBe(false);
  });

  it('rejects duplicate IDs within and across result collections', () => {
    const within = validResult();
    within.evidence.push({ ...within.evidence[0]! });
    expect(safeParseCapabilityDetectionResult(within).success).toBe(false);
    const across = validResult();
    across.ambiguities[0]!.id = across.evidence[0]!.id;
    across.candidates[0]!.ambiguityIds = [across.ambiguities[0]!.id];
    expect(safeParseCapabilityDetectionResult(across).success).toBe(false);
  });

  it('rejects duplicate candidates without documented distinct scopes', () => {
    const duplicate = validResult();
    duplicate.candidates.push({ ...structuredClone(duplicate.candidates[0]!), id: 'second-candidate' });
    expect(safeParseCapabilityDetectionResult(duplicate).success).toBe(false);
    duplicate.candidates[1]!.metadata = { ...duplicate.candidates[1]!.metadata, scope: 'separate revision outcome' };
    expect(safeParseCapabilityDetectionResult(duplicate).success).toBe(true);
  });

  it('requires explicit provenance metadata for required candidates', () => {
    const candidate = structuredClone(validResult().candidates[0]!);
    candidate.suggestedReviewState = 'required';
    expect(capabilityDetectionCandidateSchema.safeParse(candidate).success).toBe(false);
    candidate.metadata = { ...candidate.metadata, requirementBasis: 'explicit' };
    expect(capabilityDetectionCandidateSchema.safeParse(candidate).success).toBe(true);
  });

  it('rejects empty requirements and unsupported schema versions', () => {
    expect(safeParseCapabilityDetectionResult({ ...validResult(), sourceRequirement: ' ' }).success).toBe(false);
    expect(safeParseCapabilityDetectionResult({ ...validResult(), schemaVersion: '2.0' }).success).toBe(false);
  });

  it('rejects platform, runtime AI, and implementation metadata', () => {
    expect(safeParseCapabilityDetectionResult({ ...validResult(), n8nNodeType: 'switch' }).success).toBe(false);
    const runtime = validResult() as CapabilityDetectionResult & { candidates: Array<CapabilityDetectionResult['candidates'][number] & { model?: string }> };
    runtime.candidates[0]!.model = 'runtime-choice';
    expect(safeParseCapabilityDetectionResult(runtime).success).toBe(false);
    for (const key of ['provider', 'modelId', 'runtimeMemory', 'n8nNodeType', 'executionEndpoint', 'canvasId']) {
      const metadata = validResult();
      metadata.candidates[0]!.metadata = { [key]: 'external setting' };
      expect(safeParseCapabilityDetectionResult(metadata).success).toBe(false);
    }
  });

  it('validates against an independently supplied requirement without correction', () => {
    const input = validResult();
    expect(validateCapabilityDetectionResultAgainstRequirement(input, sourceRequirement)).toEqual(input);
    expect(() => validateCapabilityDetectionResultAgainstRequirement(input, 'Different requirement.')).toThrow(/does not match/);
  });

  it('does not mutate parse inputs or share nested helper state', () => {
    const input = validResult();
    const before = JSON.stringify(input);
    const parsed = parseCapabilityDetectionResult(input);
    parsed.candidates[0]!.evidenceIds.push('changed');
    expect(JSON.stringify(input)).toBe(before);
    const empty = createEmptyCapabilityDetectionResult('Receive work.', 'noop', '1.0');
    empty.warnings.push('Changed copy.');
    expect(createEmptyCapabilityDetectionResult('Receive work.', 'noop', '1.0').warnings).toEqual([]);
  });
});

describe('node-function detector interface', () => {
  it('returns a valid empty result without inferring capabilities', () => {
    const detector: NodeFunctionDetector = new NoopNodeFunctionDetector();
    const result = detector.detect({ sourceRequirement: 'Receive a request.', businessContext: { department: 'Sales', tags: ['new', 'inbound'] } });
    expect(parseCapabilityDetectionResult(result)).toEqual(result);
    expect(result.candidates).toEqual([]);
    expect(isNodeFunctionDetector(detector)).toBe(true);
  });

  it('does not mutate detector input', () => {
    const input = { sourceRequirement: 'Receive a request.', businessContext: { department: 'Sales', tags: ['new'] } };
    const before = JSON.stringify(input);
    new NoopNodeFunctionDetector().detect(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('accepts only string or string-array business context', () => {
    expect(nodeFunctionDetectorInputSchema.safeParse({ sourceRequirement: 'Receive work.', businessContext: { department: 'Sales' } }).success).toBe(true);
    expect(nodeFunctionDetectorInputSchema.safeParse({ sourceRequirement: 'Receive work.', businessContext: { count: 3 } }).success).toBe(false);
  });

  it('requires supported IDs to exist in the catalog', () => {
    const valid: NodeFunctionDetector = { id: 'reference', version: '1.0', supportedNodeFunctionIds: [NODE_FUNCTION_IDS[0]!], detect: () => createEmptyCapabilityDetectionResult('Receive work.', 'reference', '1.0') };
    expect(isNodeFunctionDetector(valid)).toBe(true);
    expect(isNodeFunctionDetector({ ...valid, supportedNodeFunctionIds: ['unknown-function'] })).toBe(false);
    expect(isNodeFunctionDetector({ ...valid, supportedNodeFunctionIds: [NODE_FUNCTION_IDS[0]!, NODE_FUNCTION_IDS[0]!] })).toBe(false);
  });
});

describe('Workflow Brief compatibility preview', () => {
  it('preserves evidence, confidence, blocking clarification, and suggested review metadata', () => {
    const result = validResult();
    const preview = previewWorkflowBriefDetectionMetadata(result, 'binary-decision-candidate');
    expect(preview.evidence[0]).toMatchObject({ sourceText: evidenceText, sourceStart: 0, sourceEnd: evidenceText.length, sourceType: 'requirement-text' });
    expect(workflowBriefEvidenceSchema.safeParse(preview.evidence[0]).success).toBe(true);
    expect(preview.confidence).toMatchObject({ score: 0.9, level: 'high' });
    expect(preview.clarificationQuestions[0]).toMatchObject({ priority: 'blocking', status: 'open', question: 'Who decides whether the request is approved?' });
    expect(workflowBriefClarificationQuestionSchema.safeParse(preview.clarificationQuestions[0]).success).toBe(true);
    expect(preview.reviewDecision).toMatchObject({ state: 'suggested', reviewedBy: 'system' });
    expect(workflowBriefReviewDecisionSchema.safeParse(preview.reviewDecision).success).toBe(true);
    expect(preview.capabilitySuggestion).toMatchObject({ capabilityType: 'binary-decision', evidenceIds: ['decision-evidence'] });
    expect(workflowBriefCapabilitySuggestionSchema.safeParse(preview.capabilitySuggestion).success).toBe(true);
    expect(preview).not.toHaveProperty('reviewState');
    expect(preview).not.toHaveProperty('schemaVersion');
  });

  it('returns defensive nested preview data and invents no confirmation or lock state', () => {
    const result = validResult();
    const preview = previewWorkflowBriefDetectionMetadata(result, 'binary-decision-candidate');
    preview.evidence[0]!.sourceText = 'changed';
    preview.clarificationQuestions[0]!.createdFromEvidenceIds.push('changed');
    expect(result.evidence[0]!.sourceText).toBe(evidenceText);
    expect(result.ambiguities[0]!.affectedEvidenceIds).toEqual(['decision-evidence']);
    expect(preview.reviewDecision.state).not.toBe('confirmed');
    expect(JSON.stringify(preview)).not.toMatch(/lockedAt|lockedBy/);
  });
});

describe('public and dependency boundaries', () => {
  it('exports the detection foundation through the knowledge package index', () => {
    expect(publicKnowledge.capabilityDetectionResultSchema).toBe(capabilityDetectionResultSchema);
    expect(publicKnowledge.NoopNodeFunctionDetector).toBe(NoopNodeFunctionDetector);
    expect(publicKnowledge.previewWorkflowBriefDetectionMetadata).toBe(previewWorkflowBriefDetectionMetadata);
  });

  it('imports no server, client, planner, platform, provider, or desktop modules', () => {
    const source = readFileSync(new URL('./capability-detection.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"][^'"]*(?:apps\/|server|client|planner|platforms|provider|desktop)[^'"]*['"]/i);
  });
});
