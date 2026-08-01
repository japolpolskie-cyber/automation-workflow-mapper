# Capability detection contract v1.0

## Purpose

The capability-detection foundation defines how future deterministic detectors may suggest conceptual node functions from raw requirement text. A result records what may be needed, why it was suggested, the exact supporting text, confidence, ambiguity, and clarification needs.

The included no-op detector always returns an empty result. Phase D Sprint 2 adds the first two bounded deterministic rules: Router and Binary Decision only.

## Detection-result lifecycle

A detector receives non-empty requirement text and optional business context containing only strings or string arrays. It returns a strict `CapabilityDetectionResult` with schema version `1.0`, detector identity and version, candidates, evidence, ambiguities, warnings, and unresolved questions.

Detection produces suggestions only. It cannot confirm a capability, lock a Workflow Brief, choose a platform implementation, or execute work.

## Evidence and offsets

Every candidate requires at least one evidence reference. Evidence contains exact source text, zero-based start and end offsets, and a business explanation. The end offset must be greater than the start, and `sourceRequirement.slice(sourceStart, sourceEnd)` must exactly equal `sourceText`. Invalid or unresolved references are rejected without correction.

## Confidence

Detection confidence has three bands:

- `low`: 0 to less than 0.5
- `medium`: 0.5 to less than 0.8
- `high`: 0.8 to 1 inclusive

`confirmed` is unavailable during detection because confirmation belongs to review. A score of 1 therefore remains detection-level `high`; future review-stage conversion must decide whether it becomes confirmed Workflow Brief confidence.

## Ambiguities and clarification

Ambiguities have `low`, `medium`, `high`, or `blocking` severity and reference supporting evidence. A blocking ambiguity must include a clarification question. Compatibility previews map questions to open Workflow Brief clarification drafts and never mark them answered.

## Candidate suggestions

A candidate references one of the finalized 23 node-function IDs, at least one evidence item, optional ambiguities, confidence, and business-level related-entity hints. Its review state is either:

- `suggested` for system inference; or
- `required` when metadata declares `requirementBasis: "explicit"`.

Duplicate candidates for one node-function ID require distinct non-empty `metadata.scope` values. Metadata accepts strings only and rejects platform, provider, model, prompt, runtime, memory, tool, credential, canvas, graph, and execution fields.

## Detector interface

`NodeFunctionDetector` is synchronous and pure. It exposes `id`, `version`, catalog-backed `supportedNodeFunctionIds`, and `detect(input)`. It requires no network, file-system, provider, or runtime dependency.

`NoopNodeFunctionDetector` is a reference implementation for contract testing. It validates input and returns no candidates, evidence, or ambiguities.

## Implemented decision detectors

`RouterDetector` detects explicit routing or classification with at least three semantic business outcomes. It preserves outcome labels independently from downstream actions, emits one decision hint and one route hint per outcome, and rejects two-way decisions, parallel fan-out, sequential action lists, collection wording, and generic route labels. An unclear routing basis or overlapping outcome set produces evidence-linked ambiguity and clarification with medium confidence.

`BinaryDecisionDetector` detects a condition with an explicit `otherwise`, `else`, or `if not` alternate and two branch actions. It emits one decision hint and exactly two route hints. Semantic labels such as `Success`/`Failure`, `Interested`/`Not Interested`, `Valid`/`Invalid`, and `Approved`/`Rejected` are preferred; `TRUE`/`FALSE` are fallback labels only. One-sided `if` clauses, descriptive approved status, parallel fan-out, and multi-outcome `else if` structures are not detected.

Both detectors are synchronous and pure. Candidate, evidence, ambiguity, and temporary entity IDs are derived deterministically from exact source offsets. Explicit complete structures use high confidence and `required` provenance; emitted Router candidates needing clarification use medium confidence. Multiple separate source scopes remain separate candidates.

## Relationship to the catalog and Workflow Brief

The finalized node-function catalog is the source of truth for candidate IDs. Unknown IDs are rejected.

`previewWorkflowBriefDetectionMetadata` creates only per-candidate draft metadata: evidence, detection confidence, open clarification questions, a system review decision, and a capability suggestion when the shared Workflow Brief has a matching capability type. It does not create or mutate a `CanonicalWorkflowBrief`, confirm review, or add lock state.

## Empty result example

```json
{
  "schemaVersion": "1.0",
  "sourceRequirement": "Receive a customer request.",
  "detectorId": "noop-node-function-detector",
  "detectorVersion": "1.0",
  "candidates": [],
  "evidence": [],
  "ambiguities": [],
  "warnings": [],
  "unresolvedQuestions": []
}
```

## Non-goals

- No detectors beyond Router and Binary Decision
- No provider prompts or model configuration
- No UI
- No Workflow Brief generation or mutation
- No graph compilation
- No platform translation
- No runtime execution
