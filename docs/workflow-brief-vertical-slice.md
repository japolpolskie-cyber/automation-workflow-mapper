# Workflow Brief vertical slice

## Current usable path

The server exposes an isolated, internal path from raw business requirement text to validated draft `CanonicalWorkflowBrief` JSON:

1. The deterministic Router, Binary Decision, Wait, and Approval detectors inspect the requirement.
2. Exact-scope results are merged without duplicate suggestions.
3. Detection evidence, confidence, ambiguity, review decisions, and business-level decision/route hints are assembled into a draft brief.
4. The complete result is parsed through the canonical shared schema before it is returned.

This path is experimental and is not connected to production Mapper generation.

## Endpoint

`POST /api/internal/workflow-brief/draft`

The request requires `sourceRequirement` and accepts optional `name`, `summary`, and `objective` strings. The standard API response envelope contains `data.brief` and `data.detectionSummary`. The summary reports the number of capability suggestions, their detected conceptual functions, and the number of open clarifications. Empty, malformed, and unknown request fields are rejected.

## Detection and review behavior

Router, Binary Decision, Wait, and Approval detection are enabled. Router supports bounded natural-language multi-outcome classification facts before its original exact-pattern fallback; Router and binary outcomes retain semantic labels. Wait supports bounded natural-language facts for response, approval, event, date, and duration boundaries before its explicit-pattern fallback, preserving stated timeout handling in detection metadata and descriptions. Their safeguards reject fan-out routing and schedule, polling, follow-up, retry, historical, or vague timing respectively. Complete Wait boundaries become business-level wait entities using the draft review action as the explicitly scaffolded resume reference. Approval entities are created only when approver, subject, and approved/rejected outcomes are explicit; incomplete detections remain capability suggestions with clarification.

Detected capabilities are system-suggested or required for review. The brief is never confirmed or locked automatically. Open high-priority or blocking ambiguity produces `needs-clarification`; otherwise the review state is `draft`.

## Draft scaffolding

The canonical schema requires at least one trigger and action. Until ordinary trigger and action detection exists, the assembler includes a draft requirement-intake start boundary and a draft action to review and refine detected workflow requirements.

Their names and descriptions explicitly identify them as scaffolding rather than extracted client facts. The same limitation is recorded in brief assumptions and warnings. They contain no actor or application references.

## Known limitations

- No detector families beyond Router, Binary Decision, Wait, and Approval are used.
- No ordinary business trigger, action, actor, or application extraction is performed.
- Semantic fact preprocessing supports Router and Wait only; Binary Decision and Approval retain their current detection strategies, and no AI/provider semantic analysis exists.
- No production Mapper integration, UI, persistence, provider call, graph generation, or platform translation exists.
- The draft remains reviewable JSON only and must not be treated as confirmed requirements.
