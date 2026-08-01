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

All 23 contracts are detailed after Phase C Sprint 5:

- `router`
- `binary-decision`
- `retry`
- `follow-up-loop`
- `revision-loop`
- `polling-loop`
- `return-to-step-loop`
- `wait`
- `approval`
- `merge`
- `iterator`
- `aggregator`
- `trigger`
- `action`
- `filter`
- `error-handler`
- `sub-workflow`
- `terminal`
- `ai-agent`
- `ai-classification`
- `ai-extraction`
- `ai-summarization`
- `ai-generation`

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

## Binary Decision behavior contract

Binary Decision chooses exactly one of two mutually exclusive business outcomes. It requires a decision subject, a condition, a positive outcome, and an alternate outcome. Both outcomes must affect workflow behavior.

Binary Decision produces exactly two routes with conditions and preserved business actions. Requirement-provided semantic labels such as `Interested` and `Not Interested` take precedence. `TRUE` and `FALSE` are permitted only as fallback labels when no semantic labels are stated.

Three or more outcomes belong to Router. Parallel fan-out, retry behavior, descriptive status text, and a condition with no alternate path are not Binary Decisions.

## Loop-family behavior contracts

The five detailed Loop-family contracts have distinct business boundaries:

- `retry` repeats a failed or incomplete operation under a required attempt bound, then follows a preserved exhausted outcome.
- `follow-up-loop` repeats outreach or reminders around a cadence until response, success, or a stopping rule.
- `revision-loop` returns rejected work for changes and re-review until acceptance, escalation, or termination.
- `polling-loop` checks external state at a required interval until completion or a bounded timeout/exhaustion outcome.
- `return-to-step-loop` returns execution to a named earlier business action and repeats from that checkpoint.

Retry must not replace communication follow-up or polling. Follow-up preserves the wait boundary and distinguishes initial contact from later outreach. Revision requires a real return-for-changes path, not merely an approved/rejected decision. Polling requires repeated checking language, an interval, and a safe bound; a direct event resume uses Wait instead. Return-to-step requires a resolvable earlier action and must not infer its target from vague step numbering.

## Wait and Approval boundaries

Wait pauses execution until one explicit duration, date, event, response, or approval boundary. It preserves the stated resume condition and action without inventing details. Repeated status checks belong to Polling Loop; recurring outreach belongs to Follow-up Loop; a recurring schedule that starts a new execution belongs to Trigger.

Approval creates an active human decision boundary with an authorized reviewer and distinct approved and rejected outcomes. Descriptive phrases such as “approved social posts,” automatic validation, notification without decision authority, and historical approval mentions do not create Approval.

## Merge, Iterator, and Aggregator

Merge synchronizes at least two workflow branches under `all`, `any`, or `first-completed` semantics before one shared continuation. It is not a generic visual junction. Mutually exclusive routes need Merge only when the business process explicitly reconverges.

Iterator processes each member of a real business collection through the same body. It preserves source retrieval before iteration, keeps explicitly per-item behavior inside the repeated body, and places collection-completion behavior afterward. Retry, Follow-up, Polling, Revision, and Return-to-step repeat for different reasons and are not Iterator behavior.

Aggregator optionally recombines Iterator results by collecting, counting, summarizing, grouping, or combining them. It requires an agreeing source Iterator and an explicit aggregate result. Aggregator is not required for every Iterator.

Merge and Aggregator are distinct: Merge synchronizes workflow branches, while Aggregator recombines item-level collection results.

## Trigger, Action, and Filter

Trigger defines the primary event, schedule, request, or manual boundary that begins an execution. It is distinct from Wait inside an active workflow, Polling after start, and recurring Follow-up outreach. Explicit source application context is preserved.

Action represents one concrete business operation with a defined subject, inputs, result, and optional application or actor context. It must not collapse unrelated work or replace Trigger, Decision, Wait, Iterator, Merge, or Aggregator boundaries.

Filter is a one-sided gate: matching items or executions continue while non-matches are skipped, discarded, ignored, or stopped. When both outcomes contain meaningful downstream work, Binary Decision is appropriate; three or more outcomes use Router.

## Failure, delegation, and finality

Error Handler responds to operational failure through recovery, escalation, compensation, fallback, audit, or termination. It preserves Retry exhaustion and is distinct from ordinary business rejection.

Sub-workflow delegates a coherent reusable multi-step business process through explicit input, output, success, and failure boundaries. One operation remains Action, and an internal return remains Return-to-step Loop. Sub-workflow remains conceptual and contains no execution identifier.

Terminal represents a semantic final success, failure, rejection, cancellation, or completion state with no outgoing continuation. Recoverable failure belongs to Error Handler; a Wait, Merge, notification, or loop exit followed by more work is not terminal.

## Conceptual AI behavior contracts

The five AI contracts describe reviewed business behavior only. They contain no runtime choices, external-system access configuration, retained-context implementation, or execution settings.

- AI Agent handles open-ended, context-dependent, multi-step interaction that dynamically selects among bounded business capabilities. It requires explicit authority, completion or handoff, human escalation, safety limits, and clarification boundaries.
- AI Classification assigns unstructured content to a predefined category set with an explicit fallback or review outcome. Classification produces labels; Router applies downstream business paths.
- AI Extraction identifies a defined set of fields from unstructured content. Missing and uncertain values remain distinct, and absent facts must not be invented.
- AI Summarization produces a shorter, faithful representation for a stated audience and purpose while preserving required facts, decisions, risks, and uncertainty.
- AI Generation creates one bounded new business artifact from approved facts and constraints. Creating content does not grant authority to send or publish it.

Deterministic behavior remains preferred whenever structured rules, known fields, fixed templates, or ordinary business actions are sufficient. AI wording alone does not select an AI contract, and ambiguity about scope or authority requires clarification and review.

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

This catalog does not implement requirement detection, platform translation, runtime execution, UI behavior, provider prompts, graph compilation, or catalog-to-runtime integration.
