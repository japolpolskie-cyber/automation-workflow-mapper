# Workflow Brief vertical slice

## Current usable path

The server exposes an isolated, internal path from raw business requirement text to validated draft `CanonicalWorkflowBrief` JSON:

1. The deterministic Router and Binary Decision detectors inspect the requirement.
2. Exact-scope results are merged without duplicate suggestions.
3. Detection evidence, confidence, ambiguity, review decisions, and business-level decision/route hints are assembled into a draft brief.
4. The complete result is parsed through the canonical shared schema before it is returned.

This path is experimental and is not connected to production Mapper generation.

## Endpoint

`POST /api/internal/workflow-brief/draft`

The request requires `sourceRequirement` and accepts optional `name`, `summary`, and `objective` strings. The standard API response envelope contains `data.brief` and `data.detectionSummary`. The summary reports the number of capability suggestions, their detected conceptual functions, and the number of open clarifications. Empty, malformed, and unknown request fields are rejected.

## Detection and review behavior

Only Router and Binary Decision detection is enabled. Router outcomes retain their semantic labels, and binary decisions retain semantic labels when available with TRUE/FALSE only as detector fallback. Router results take precedence only when the same exact evidence scope would otherwise produce both forms.

Detected capabilities are system-suggested or required for review. The brief is never confirmed or locked automatically. Open high-priority or blocking ambiguity produces `needs-clarification`; otherwise the review state is `draft`.

## Draft scaffolding

The canonical schema requires at least one trigger and action. Until ordinary trigger and action detection exists, the assembler includes a draft requirement-intake start boundary and a draft action to review and refine detected workflow requirements.

Their names and descriptions explicitly identify them as scaffolding rather than extracted client facts. The same limitation is recorded in brief assumptions and warnings. They contain no actor or application references.

## Known limitations

- No detector families beyond Router and Binary Decision are used.
- No ordinary business trigger, action, actor, or application extraction is performed.
- No production Mapper integration, UI, persistence, provider call, graph generation, or platform translation exists.
- The draft remains reviewable JSON only and must not be treated as confirmed requirements.

