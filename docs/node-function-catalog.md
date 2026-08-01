# Conceptual node-function catalog

## Purpose

The conceptual node-function catalog defines business functions that the future Workflow Brief Engine may select. A contract explains what a function means, when it applies, when it does not apply, the information and semantic outputs it requires, and when ambiguity needs clarification.

A conceptual function is not a platform node. Catalog contracts contain no connector configuration, platform-specific node names, credentials, runtime fields, or execution behavior.

## Relationship to the Workflow Brief

Catalog contracts describe the meaning of concepts represented by the Canonical Workflow Brief. The Router contract maps to a multi-route `WorkflowBriefDecision`; its semantic outcomes map to `WorkflowBriefRoute` entries. The knowledge package reuses the shared Workflow Brief entity-type schema, preserving alignment without introducing a circular dependency.

The catalog does not currently detect requirements or change a Workflow Brief.

## Contract lifecycle

- `foundation`: catalog coverage exists, but detailed behavior remains deferred.
- `detailed`: selection, exclusion, inputs, outputs, safeguards, and examples are fully specified.
- `deprecated`: retained for compatibility but no longer intended for new selection.

## Current inventory

Router is the only detailed contract in Phase C Sprint 1. These entries are foundation status:

- Trigger and action: `trigger`, `action`
- Decisions and filtering: `binary-decision`, `filter`
- Collections and synchronization: `iterator`, `aggregator`, `merge`
- Timing and human boundaries: `wait`, `approval`
- Loop and resilience concepts: `retry`, `follow-up-loop`, `revision-loop`, `polling-loop`, `return-to-step-loop`, `error-handler`
- Orchestration and completion: `sub-workflow`, `terminal`
- Conceptual AI functions: `ai-agent`, `ai-classification`, `ai-extraction`, `ai-summarization`, `ai-generation`

## Router behavior contract

Router sends one workflow execution to one of several mutually distinguishable business outcomes. Use it when a requirement explicitly routes, categorizes, distributes, or chooses among several named departments, statuses, categories, priorities, regions, products, request types, or comparable outcomes.

Required information includes the subject being routed, the business condition that distinguishes routes, and the expected outcomes. Unmatched behavior is required only when a fallback is relevant.

Router outputs preserve:

- at least two routes;
- a semantic business label for each route;
- the condition or meaning of each route;
- the target business outcome or next action; and
- an optional fallback route when outcomes are not exhaustive.

Exactly two outcomes are normally a Binary Decision. Parallel fan-out, item iteration, retry/loop-back behavior, sequential actions, and a single downstream action are not Router behavior.

## Semantic route-label rule

Route labels describe business outcomes. Labels such as `IT`, `Marketing`, `Customer Support`, `Paid`, `Pending`, `Overdue`, and priority names are valid when supported by the requirement.

Generic numbered labels such as `Output 1`, `Route 2`, `Branch 1`, and `Path 2` are invalid. A route label must not be derived automatically from its downstream action name. For example, a `Finance` route remains `Finance` if its downstream action changes from `Create finance ticket` to `Notify finance team`.

Clarification is required when route outcomes overlap or their selecting conditions are missing. A fallback must not be invented when the stated outcomes are exhaustive.

## Examples

Router examples:

- “Route incoming requests to IT, Marketing, or Customer Support.”
- “Classify invoices as Paid, Pending, or Overdue.”
- “Send high-priority cases to escalation, medium-priority cases to review, and low-priority cases to the standard queue.”

Excluded examples:

- “If approved, continue; otherwise stop.” — Binary Decision.
- “Send the same message to chat and email.” — parallel fan-out.
- “For each attachment, save the file.” — Iterator.
- “Retry twice if delivery fails.” — retry loop.
- “Create a Finance ticket.” — action only.

## Non-goals

This catalog does not implement requirement detection, platform translation, runtime execution, UI behavior, provider prompts, graph compilation, or detailed behavior for the foundation entries.
