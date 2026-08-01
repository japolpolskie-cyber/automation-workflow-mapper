# Conceptual node-function catalog

## Purpose

The conceptual node-function catalog defines business functions that the future Workflow Brief Engine may select. A contract explains what a function means, when it applies, when it does not apply, the information and semantic outputs it requires, and when ambiguity needs clarification.

A conceptual function is not a platform node. Catalog contracts contain no connector configuration, platform-specific node names, credentials, runtime fields, or execution behavior.

## Relationship to the Workflow Brief

Catalog contracts describe the meaning of concepts represented by the Canonical Workflow Brief. Every catalog entry declares at least one valid Workflow Brief relationship. Direct entity mappings cover triggers, actions, decisions, routes, loops, waits, approvals, merges, iterators, and aggregators. Error Handler, Sub-workflow, Terminal, and the five AI functions may remain capability-level concepts where the brief has no dedicated entity. The knowledge package reuses the shared Workflow Brief entity-type schema, preserving alignment without introducing a circular dependency.

The catalog itself does not detect requirements or change a Workflow Brief. The separate capability-detection layer currently implements bounded Router and Binary Decision detectors that return catalog-backed suggestions only.

## Contract lifecycle

- `foundation`: catalog coverage exists, but detailed behavior remains deferred.
- `detailed`: selection, exclusion, inputs, outputs, safeguards, and examples are fully specified.
- `deprecated`: retained for compatibility but no longer intended for new selection.

## Complete inventory by category

All 23 contracts are detailed after Phase C Sprint 6:

- Start: `trigger`
- Business operation: `action`
- Decision and routing: `binary-decision`, `router`, `filter`
- Collection: `iterator`, `aggregator`
- Synchronization: `merge`
- Timing: `wait`, `follow-up-loop`, `polling-loop`
- Human boundary: `approval`, `revision-loop`
- Resilience: `retry`, `error-handler`
- Orchestration: `return-to-step-loop`, `sub-workflow`
- Finality: `terminal`
- Conceptual AI: `ai-agent`, `ai-classification`, `ai-extraction`, `ai-summarization`, `ai-generation`

The catalog contains no undocumented extra entries and no foundation-status entries.

## Public catalog contract

`@awm/knowledge` exports strict schemas, inferred types, individual detailed contracts, and pure catalog access:

- `listNodeFunctionContracts()` returns a defensive copy of the complete catalog.
- `getNodeFunctionContract(id)` performs normalized lookup and returns a defensive copy or `undefined`.
- `hasNodeFunctionContract(id)` reports whether a normalized ID exists.
- `parseNodeFunctionContract(input)` and `safeParseNodeFunctionContract(input)` preserve strict validation behavior.
- `validateNodeFunctionCatalog(input?)` performs a pure, structured whole-catalog audit without file access or mutation.
- `NODE_FUNCTION_IDS`, `NODE_FUNCTION_COUNT`, `DETAILED_NODE_FUNCTION_IDS`, and `NODE_FUNCTION_CATEGORIES_IN_USE` are frozen values derived from the parsed catalog source of truth.

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

## Major cross-contract distinctions

- Trigger begins a new execution; Wait pauses an existing one; Polling repeatedly checks; Follow-up repeatedly communicates.
- Action performs one business operation; Filter is a one-sided gate; Binary Decision preserves two meaningful outcomes; Router selects among multiple semantic outcomes.
- Router is mutually exclusive routing, not parallel fan-out or branch synchronization.
- Iterator repeats by collection membership, not failure, outreach cadence, or repeated state checking.
- Aggregator recombines item results; Merge synchronizes workflow branches.
- Approval requires an active human decision. Descriptive approved status is not Approval, and return-for-changes behavior belongs to Revision Loop.
- Retry repeats an operation under a bound; Error Handler owns final operational failure handling. Normal negative business outcomes are not errors.
- Sub-workflow delegates a reusable multi-step process; Action is one operation; Return-to-step Loop stays within the current process.
- Terminal has no continuation; recoverable failure belongs to Error Handler.
- AI Agent handles bounded open-ended interaction. Classification assigns known labels, Extraction identifies defined fields, Summarization faithfully compresses source content, and Generation creates one bounded artifact.

## Current detection coverage

Detection is implemented only for `router` and `binary-decision`. Router requires explicit multi-outcome routing with at least three semantic labels. Binary Decision requires a condition and explicit alternate behavior. Both return evidence-bearing suggestions and temporary business-level hints; neither creates Workflow Brief entities, graph topology, or platform nodes. Every other catalog function remains detection-deferred.

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

This catalog does not implement requirement detection, prompt construction, runtime execution, platform translation, UI review behavior, graph compilation, or catalog-to-runtime integration.

## Lifecycle and versioning

Phase C establishes the complete initial public catalog contract. Existing IDs and meanings should remain stable. Additive helpers and strictly compatible validation hardening may be introduced without renaming concepts. A new function requires a verified business-level coverage gap that cannot be represented by an existing contract; alternate wording or a platform-specific node is not sufficient justification. Deprecation must preserve compatibility and be documented before removal.
