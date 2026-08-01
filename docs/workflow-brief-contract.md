# Canonical Workflow Brief v1.0 contract

## Purpose

The Canonical Workflow Brief is the internal, business-level representation of what an automation process must accomplish. It records business participants, applications, triggers, actions, control flow, supporting evidence, uncertainty, clarification needs, and review decisions before any future graph compilation or platform translation.

The public contract is exported by `@awm/shared`. Inputs are validated with strict Zod schemas: unknown fields and unsupported schema versions fail explicitly.

## Lifecycle

- `draft`: initial business representation.
- `under-review`: actively being reviewed.
- `needs-clarification`: unresolved information requires attention.
- `reviewed`: review is complete but the brief is not locked.
- `locked`: approved business authority eligible for future Mapper compilation.
- `rejected`: retained but not eligible for future execution.

Only `locked` briefs carry `lockedAt` and `lockedBy`.

## Top-level fields

A v1.0 brief contains:

- Identity and intent: `schemaVersion`, `id`, `name`, `summary`, `objective`, and `sourceRequirement`.
- Business entities: `actors`, `applications`, `triggers`, and `actions`.
- Control flow: `routes`, `decisions`, `loops`, `waits`, `approvals`, `merges`, `iterators`, and `aggregators`.
- Explainability and review: `evidence`, `confidence`, `clarificationQuestions`, `reviewDecisions`, `capabilitySuggestions`, and `reviewState`.
- Supporting context: `assumptions`, `missingInformation`, `warnings`, and `completionCriteria`.

At least one trigger and one action are required. IDs are unique within each entity collection, and typed references must resolve.

## Control-flow entities

- Decisions are binary or multi-route and reference at least two routes.
- Routes describe business conditions and outcomes. Generic labels such as `Route 1` or `Output 2` are invalid.
- Loops represent collection processing, bounded retry, follow-up, revision, polling, or return-to-step behavior.
- Waits preserve a duration, date, event, response, or approval boundary.
- Approvals represent an active human approval request and distinct approved/rejected outcomes; descriptive approved status alone is insufficient.
- Merges rejoin multiple routes.
- Iterators process each item in a collection and may identify an aggregator.
- Aggregators collect, summarize, count, group, or combine iterator results. Iterator and aggregator references must agree.

## Evidence and confidence

Evidence identifies its source, source text, explanation, and typed related entity. Requirement-text offsets are optional but must appear as a valid start/end pair within `sourceRequirement`.

Confidence is analysis metadata only. Scores use fixed ranges:

- `low`: 0 to less than 0.5
- `medium`: 0.5 to less than 0.8
- `high`: 0.8 to less than 1
- `confirmed`: exactly 1

Confidence does not select a provider or platform implementation.

## Clarification and review decisions

Clarification questions may be open, answered, or dismissed. Answered questions require an answer and answer source; other states cannot carry answers. Related entity and evidence references must resolve.

Review decisions record whether an entity is suggested, required, confirmed, rejected, or edited. User confirmations and rejections require a review timestamp. Edited decisions may identify a different replacement entity of the same type.

## Capability suggestions

Capability suggestions describe conceptual business needs such as decisions, loops, waits, approvals, collection handling, human review, error handling, sub-workflows, or conceptual AI assistance. Each suggestion references related business entities, evidence, confidence, and a review decision.

AI capabilities remain conceptual. They do not contain provider names, model configuration, tools, memory, credentials, or execution settings.

## Lock eligibility

A locked brief must:

- include `lockedAt` and `lockedBy`;
- have no open blocking clarification question;
- have no rejected active capability or control-flow review decision;
- retain valid entity and evidence references;
- provide evidence for every capability suggestion; and
- link every capability suggestion to a `confirmed` or `required` review decision.

Validation of a lock does not compile, translate, or execute a workflow.

## JSON example

This is the minimum compatibility fixture:

```json
{
  "schemaVersion": "1.0",
  "id": "minimum-brief",
  "name": "Minimum business process",
  "summary": "Complete one business task.",
  "objective": "Complete the requested work.",
  "sourceRequirement": "When work arrives, complete it.",
  "actors": [],
  "applications": [],
  "triggers": [
    {
      "id": "work-received",
      "name": "Work received",
      "description": "Work becomes available.",
      "triggerType": "event"
    }
  ],
  "actions": [
    {
      "id": "complete-work",
      "name": "Complete work",
      "description": "Complete the requested business work.",
      "inputs": [],
      "outputs": ["completed work"]
    }
  ],
  "routes": [],
  "decisions": [],
  "loops": [],
  "waits": [],
  "approvals": [],
  "merges": [],
  "iterators": [],
  "aggregators": [],
  "evidence": [],
  "confidence": [],
  "clarificationQuestions": [],
  "reviewDecisions": [],
  "capabilitySuggestions": [],
  "reviewState": { "status": "draft", "version": 1, "notes": [] },
  "assumptions": [],
  "missingInformation": [],
  "warnings": [],
  "completionCriteria": ["The requested work is complete."]
}
```

Use `parseCanonicalWorkflowBrief`, `safeParseCanonicalWorkflowBrief`, and `serializeCanonicalWorkflowBrief` from `@awm/shared` for validation and pure JSON serialization.

## Versioning and compatibility

- Patch-level internal fixes may tighten incorrect validation without changing `schemaVersion` when they only reject previously invalid data.
- Additive optional fields may remain within v1.0 when backward-compatible.
- New required fields, renamed fields, changed meanings, or incompatible enum changes require a future schema version.
- Unsupported schema versions fail explicitly.
- Migration helpers are deferred until a second schema version exists.

## Non-goals

The v1.0 contract contains no provider configuration, platform node names, canvas graph IDs, runtime AI tools or memory, direct workflow execution, detection behavior, or graph compilation behavior.
