import {
  workflowBriefCapabilitySuggestionSchema,
  workflowBriefClarificationQuestionSchema,
  workflowBriefEntityTypeSchema,
  workflowBriefEvidenceSchema,
  workflowBriefReviewDecisionSchema,
  type WorkflowBriefCapabilitySuggestion,
  type WorkflowBriefClarificationQuestion,
  type WorkflowBriefEvidence,
  type WorkflowBriefReviewDecision,
} from '@awm/shared';
import { z } from 'zod';
import { NODE_FUNCTION_IDS } from './node-function-catalog.js';

export const CAPABILITY_DETECTION_SCHEMA_VERSION = '1.0' as const;

const idSchema = z.string().trim().min(1, 'ID must not be empty.');
const textSchema = z.string().trim().min(1);
const implementationLanguage = /\b(?:n8n|make(?:\.com)?|zapier|reactflow|provider|model(?:id)?|prompt|runtime|memory|tools?|credentials?|api keys?|canvas|node ids?|edges?|execution|endpoint|ollama|openai|chatgpt|claude|gemini|gpt(?:-\d[\w.-]*)?)\b/i;
const implementationFieldName = /(?:n8n|makecom|zapier|reactflow|platform|provider|model|prompt|runtime|memory|tool|credential|apikey|canvas|nodeid|edge|execution|endpoint)/i;
const businessTextSchema = textSchema.refine((value) => !implementationLanguage.test(value), 'Detection metadata must remain business-level.');
const nodeFunctionIdSchema = textSchema.refine((id) => NODE_FUNCTION_IDS.includes(id), 'Unknown node-function ID.');

export const capabilityDetectionEvidenceSchema = z.object({
  id: idSchema,
  sourceText: textSchema,
  sourceStart: z.number().int().nonnegative(),
  sourceEnd: z.number().int().nonnegative(),
  explanation: businessTextSchema,
}).strict().superRefine((evidence, context) => {
  if (evidence.sourceEnd <= evidence.sourceStart) context.addIssue({ code: z.ZodIssueCode.custom, message: 'sourceEnd must be greater than sourceStart.', path: ['sourceEnd'] });
});

export const capabilityDetectionConfidenceLevelSchema = z.enum(['low', 'medium', 'high']);
export const capabilityDetectionConfidenceSchema = z.object({
  score: z.number().min(0).max(1),
  level: capabilityDetectionConfidenceLevelSchema,
  reason: businessTextSchema,
}).strict().superRefine((confidence, context) => {
  const matches = confidence.level === 'low' ? confidence.score < 0.5
    : confidence.level === 'medium' ? confidence.score >= 0.5 && confidence.score < 0.8
      : confidence.score >= 0.8;
  if (!matches) context.addIssue({ code: z.ZodIssueCode.custom, message: `Confidence score does not match the ${confidence.level} detection band.`, path: ['score'] });
});

export const capabilityDetectionAmbiguitySeveritySchema = z.enum(['low', 'medium', 'high', 'blocking']);
export const capabilityDetectionAmbiguitySchema = z.object({
  id: idSchema,
  description: businessTextSchema,
  severity: capabilityDetectionAmbiguitySeveritySchema,
  clarificationQuestion: businessTextSchema.optional(),
  affectedEvidenceIds: z.array(idSchema),
}).strict().superRefine((ambiguity, context) => {
  if (new Set(ambiguity.affectedEvidenceIds).size !== ambiguity.affectedEvidenceIds.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Affected evidence IDs must be unique.', path: ['affectedEvidenceIds'] });
  if (ambiguity.severity === 'blocking' && !ambiguity.clarificationQuestion) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A blocking ambiguity requires a clarificationQuestion.', path: ['clarificationQuestion'] });
});

export const capabilityDetectionRelatedEntityHintSchema = z.object({
  entityType: workflowBriefEntityTypeSchema,
  temporaryId: idSchema,
  description: businessTextSchema,
}).strict();

const metadataSchema = z.record(textSchema).superRefine((metadata, context) => {
  Object.entries(metadata).forEach(([key, value]) => {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, '');
    if (implementationFieldName.test(normalizedKey) || implementationLanguage.test(value)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Candidate metadata must not contain implementation or runtime concepts.', path: [key] });
  });
});

export const capabilityDetectionSuggestedReviewStateSchema = z.enum(['suggested', 'required']);
export const capabilityDetectionCandidateSchema = z.object({
  id: idSchema,
  nodeFunctionId: nodeFunctionIdSchema,
  name: businessTextSchema,
  explanation: businessTextSchema,
  evidenceIds: z.array(idSchema).min(1),
  confidence: capabilityDetectionConfidenceSchema,
  ambiguityIds: z.array(idSchema),
  suggestedReviewState: capabilityDetectionSuggestedReviewStateSchema,
  relatedEntityHints: z.array(capabilityDetectionRelatedEntityHintSchema),
  metadata: metadataSchema.optional(),
}).strict().superRefine((candidate, context) => {
  if (new Set(candidate.evidenceIds).size !== candidate.evidenceIds.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Candidate evidence IDs must be unique.', path: ['evidenceIds'] });
  if (new Set(candidate.ambiguityIds).size !== candidate.ambiguityIds.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Candidate ambiguity IDs must be unique.', path: ['ambiguityIds'] });
  const temporaryIds = candidate.relatedEntityHints.map((hint) => hint.temporaryId);
  if (new Set(temporaryIds).size !== temporaryIds.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Related entity temporary IDs must be unique.', path: ['relatedEntityHints'] });
  if (candidate.suggestedReviewState === 'required' && candidate.metadata?.requirementBasis !== 'explicit') context.addIssue({ code: z.ZodIssueCode.custom, message: 'A required candidate must declare metadata.requirementBasis as explicit.', path: ['metadata', 'requirementBasis'] });
});

const uniqueIds = (items: readonly { id: string }[], collection: string, context: z.RefinementCtx) => {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate ${collection} ID "${item.id}" is not allowed.`, path: [collection, index, 'id'] });
    seen.add(item.id);
  });
};

export const capabilityDetectionResultSchema = z.object({
  schemaVersion: z.literal(CAPABILITY_DETECTION_SCHEMA_VERSION),
  sourceRequirement: textSchema,
  detectorId: idSchema,
  detectorVersion: textSchema,
  candidates: z.array(capabilityDetectionCandidateSchema),
  evidence: z.array(capabilityDetectionEvidenceSchema),
  ambiguities: z.array(capabilityDetectionAmbiguitySchema),
  warnings: z.array(businessTextSchema),
  unresolvedQuestions: z.array(businessTextSchema),
}).strict().superRefine((result, context) => {
  uniqueIds(result.candidates, 'candidates', context);
  uniqueIds(result.evidence, 'evidence', context);
  uniqueIds(result.ambiguities, 'ambiguities', context);

  const allIds = new Map<string, string>();
  for (const [collection, items] of [['candidates', result.candidates], ['evidence', result.evidence], ['ambiguities', result.ambiguities]] as const) {
    items.forEach((item, index) => {
      const previous = allIds.get(item.id);
      if (previous) context.addIssue({ code: z.ZodIssueCode.custom, message: `ID "${item.id}" is already used in ${previous}.`, path: [collection, index, 'id'] });
      else allIds.set(item.id, collection);
    });
  }

  const evidenceIds = new Set(result.evidence.map((item) => item.id));
  const ambiguityIds = new Set(result.ambiguities.map((item) => item.id));
  result.evidence.forEach((evidence, index) => {
    if (evidence.sourceEnd > result.sourceRequirement.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Evidence offsets exceed sourceRequirement length.', path: ['evidence', index, 'sourceEnd'] });
    if (result.sourceRequirement.slice(evidence.sourceStart, evidence.sourceEnd) !== evidence.sourceText) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Evidence sourceText must exactly match the sourceRequirement slice.', path: ['evidence', index, 'sourceText'] });
  });
  result.ambiguities.forEach((ambiguity, index) => ambiguity.affectedEvidenceIds.forEach((id, evidenceIndex) => {
    if (!evidenceIds.has(id)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown evidence reference "${id}".`, path: ['ambiguities', index, 'affectedEvidenceIds', evidenceIndex] });
  }));
  result.candidates.forEach((candidate, index) => {
    candidate.evidenceIds.forEach((id, evidenceIndex) => {
      if (!evidenceIds.has(id)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown evidence reference "${id}".`, path: ['candidates', index, 'evidenceIds', evidenceIndex] });
    });
    candidate.ambiguityIds.forEach((id, ambiguityIndex) => {
      if (!ambiguityIds.has(id)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown ambiguity reference "${id}".`, path: ['candidates', index, 'ambiguityIds', ambiguityIndex] });
    });
  });

  const candidatesByFunction = new Map<string, Array<{ candidate: CapabilityDetectionCandidate; index: number }>>();
  result.candidates.forEach((candidate, index) => {
    const matches = candidatesByFunction.get(candidate.nodeFunctionId) ?? [];
    matches.push({ candidate, index });
    candidatesByFunction.set(candidate.nodeFunctionId, matches);
  });
  for (const matches of candidatesByFunction.values()) {
    if (matches.length < 2) continue;
    const scopes = new Set<string>();
    matches.forEach(({ candidate, index }) => {
      const scope = candidate.metadata?.scope?.trim();
      if (!scope || scopes.has(scope)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate node-function candidates require distinct metadata.scope values.', path: ['candidates', index, 'metadata', 'scope'] });
      if (scope) scopes.add(scope);
    });
  }
});

export const nodeFunctionDetectorInputSchema = z.object({
  sourceRequirement: textSchema,
  businessContext: z.record(z.union([textSchema, z.array(textSchema)])).optional(),
}).strict();

export interface NodeFunctionDetector {
  readonly id: string;
  readonly version: string;
  readonly supportedNodeFunctionIds: readonly string[];
  detect(input: NodeFunctionDetectorInput): CapabilityDetectionResult;
}

export function parseCapabilityDetectionResult(input: unknown): CapabilityDetectionResult {
  return capabilityDetectionResultSchema.parse(input);
}

export function safeParseCapabilityDetectionResult(input: unknown) {
  return capabilityDetectionResultSchema.safeParse(input);
}

export function validateCapabilityDetectionResultAgainstRequirement(input: unknown, sourceRequirement: string): CapabilityDetectionResult {
  const result = parseCapabilityDetectionResult(input);
  if (result.sourceRequirement !== sourceRequirement) throw new Error('Detection result sourceRequirement does not match the supplied requirement.');
  return structuredClone(result);
}

export function createEmptyCapabilityDetectionResult(sourceRequirement: string, detectorId: string, detectorVersion: string): CapabilityDetectionResult {
  return parseCapabilityDetectionResult({
    schemaVersion: CAPABILITY_DETECTION_SCHEMA_VERSION,
    sourceRequirement,
    detectorId,
    detectorVersion,
    candidates: [],
    evidence: [],
    ambiguities: [],
    warnings: [],
    unresolvedQuestions: [],
  });
}

export function isNodeFunctionDetector(value: unknown): value is NodeFunctionDetector {
  if (!value || typeof value !== 'object') return false;
  const detector = value as Partial<NodeFunctionDetector>;
  return typeof detector.id === 'string' && detector.id.trim().length > 0
    && typeof detector.version === 'string' && detector.version.trim().length > 0
    && Array.isArray(detector.supportedNodeFunctionIds)
    && new Set(detector.supportedNodeFunctionIds).size === detector.supportedNodeFunctionIds.length
    && detector.supportedNodeFunctionIds.every((id) => typeof id === 'string' && NODE_FUNCTION_IDS.includes(id))
    && typeof detector.detect === 'function';
}

export class NoopNodeFunctionDetector implements NodeFunctionDetector {
  readonly id = 'noop-node-function-detector';
  readonly version = '1.0';
  readonly supportedNodeFunctionIds: readonly string[] = Object.freeze([]);

  detect(input: NodeFunctionDetectorInput): CapabilityDetectionResult {
    const parsedInput = nodeFunctionDetectorInputSchema.parse(input);
    return createEmptyCapabilityDetectionResult(parsedInput.sourceRequirement, this.id, this.version);
  }
}

const capabilityTypeByNodeFunctionId: Readonly<Record<string, WorkflowBriefCapabilitySuggestion['capabilityType']>> = Object.freeze({
  'binary-decision': 'binary-decision', router: 'multi-route-decision', retry: 'retry', 'follow-up-loop': 'loop',
  'revision-loop': 'loop', 'polling-loop': 'loop', 'return-to-step-loop': 'loop', wait: 'wait', approval: 'approval',
  merge: 'merge', iterator: 'iterator', aggregator: 'aggregator', 'error-handler': 'error-handling',
  'sub-workflow': 'sub-workflow', 'ai-agent': 'ai-agent', 'ai-classification': 'ai-classification',
  'ai-extraction': 'ai-extraction', 'ai-summarization': 'ai-summarization', 'ai-generation': 'ai-generation',
});

export interface WorkflowBriefDetectionConfidencePreview {
  id: string;
  entityType: 'capability';
  entityId: string;
  score: number;
  level: CapabilityDetectionConfidenceLevel;
  reason: string;
}

export interface WorkflowBriefDetectionPreview {
  evidence: WorkflowBriefEvidence[];
  confidence: WorkflowBriefDetectionConfidencePreview;
  clarificationQuestions: WorkflowBriefClarificationQuestion[];
  reviewDecision: WorkflowBriefReviewDecision;
  capabilitySuggestion?: WorkflowBriefCapabilitySuggestion;
}

export function previewWorkflowBriefDetectionMetadata(resultInput: unknown, candidateId: string): WorkflowBriefDetectionPreview {
  const result = parseCapabilityDetectionResult(resultInput);
  const candidate = result.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new Error(`Unknown detection candidate "${candidateId}".`);
  const candidateEvidence = result.evidence.filter((item) => candidate.evidenceIds.includes(item.id));
  const evidence = candidateEvidence.map((item) => workflowBriefEvidenceSchema.parse({
    ...item,
    sourceType: 'requirement-text',
    relatedEntityType: 'capability',
    relatedEntityId: candidate.id,
  }));
  const confidence: WorkflowBriefDetectionConfidencePreview = {
    id: `${candidate.id}-confidence`, entityType: 'capability', entityId: candidate.id,
    score: candidate.confidence.score, level: candidate.confidence.level, reason: candidate.confidence.reason,
  };
  const clarificationQuestions = result.ambiguities
    .filter((item) => candidate.ambiguityIds.includes(item.id) && item.clarificationQuestion)
    .map((item) => workflowBriefClarificationQuestionSchema.parse({
      id: `${item.id}-question`, question: item.clarificationQuestion, reason: item.description,
      relatedEntityType: 'capability', relatedEntityId: candidate.id, priority: item.severity,
      status: 'open', createdFromEvidenceIds: item.affectedEvidenceIds,
    }));
  const reviewDecision = workflowBriefReviewDecisionSchema.parse({
    id: `${candidate.id}-review`, entityType: 'capability', entityId: candidate.id,
    state: candidate.suggestedReviewState, reason: candidate.explanation, reviewedBy: 'system',
  });
  const capabilityType = capabilityTypeByNodeFunctionId[candidate.nodeFunctionId];
  const capabilitySuggestion = capabilityType ? workflowBriefCapabilitySuggestionSchema.parse({
    id: candidate.id,
    capabilityType,
    name: candidate.name,
    description: candidate.explanation,
    relatedEntityIds: candidate.relatedEntityHints.map((hint) => hint.temporaryId),
    evidenceIds: candidate.evidenceIds,
    confidenceId: confidence.id,
    reviewDecisionId: reviewDecision.id,
    configurationQuestions: clarificationQuestions.map((question) => question.question),
  }) : undefined;
  const preview = { evidence, confidence, clarificationQuestions, reviewDecision };
  return capabilitySuggestion
    ? structuredClone({ ...preview, capabilitySuggestion })
    : structuredClone(preview);
}

export type CapabilityDetectionEvidence = z.infer<typeof capabilityDetectionEvidenceSchema>;
export type CapabilityDetectionConfidenceLevel = z.infer<typeof capabilityDetectionConfidenceLevelSchema>;
export type CapabilityDetectionConfidence = z.infer<typeof capabilityDetectionConfidenceSchema>;
export type CapabilityDetectionAmbiguitySeverity = z.infer<typeof capabilityDetectionAmbiguitySeveritySchema>;
export type CapabilityDetectionAmbiguity = z.infer<typeof capabilityDetectionAmbiguitySchema>;
export type CapabilityDetectionRelatedEntityHint = z.infer<typeof capabilityDetectionRelatedEntityHintSchema>;
export type CapabilityDetectionSuggestedReviewState = z.infer<typeof capabilityDetectionSuggestedReviewStateSchema>;
export type CapabilityDetectionCandidate = z.infer<typeof capabilityDetectionCandidateSchema>;
export type CapabilityDetectionResult = z.infer<typeof capabilityDetectionResultSchema>;
export type NodeFunctionDetectorInput = z.infer<typeof nodeFunctionDetectorInputSchema>;
