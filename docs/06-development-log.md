# Development log

## Completed deterministic accuracy improvements

### Narrower approval-language detection

- Original problem: Descriptive status phrases such as “approved social posts” created a new human-approval workflow.
- Implemented rule: Require an approval action, request, review, decision, or waiting boundary; do not promote an attributive “approved” status alone.
- Affected subsystem: Scope intelligence and approval-focused tests.
- Verification: Focused and full server suites passed; committed as `cf3df2b`.

### Natural binary condition topology

- Original problem: Clause-level `if … otherwise`, `else`, and `if not` language flattened into sequential actions.
- Implemented rule: Detect a bounded condition with an explicit alternate outcome and compile one decision with TRUE/FALSE branches while preserving semantic outcome text.
- Affected subsystem: Scope intelligence, control-flow classification, deterministic compilation, and tests.
- Verification: Focused and full server suites passed; committed as `de2af98`.

### Verb-to-function classification

- Original problem: Retrieve/search, validate, notify, and log verbs frequently became generic actions.
- Implemented rule: Add bounded verb/entity mappings to existing canonical functions with exclusions for approval, interpersonal checking, video recording, and ordinary delivery.
- Affected subsystem: Scope intelligence, deterministic compiler preservation, and tests.
- Verification: Focused and full server suites passed; committed as `d3c0863`.

### Collection-pattern ordering preservation

- Original problem: Iterator/aggregator compilation discarded detected retrieval and completion notification steps.
- Implemented rule: Preserve retrieval before iteration and completion notification after aggregation/completion without duplication; add aggregation only when required.
- Affected subsystem: Deterministic skeleton compiler and collection tests.
- Verification: Focused and full server suites passed; committed as `ed65356`.

### Delay-boundary detection and titling

- Original problem: Wait nodes used generic titles and `pause/delay … until` could be mistaken for a generic loop.
- Implemented rule: Preserve explicit duration, date, response, approval, or resume boundaries in concise wait titles; keep reminder cadence under its existing pattern.
- Affected subsystem: Scope intelligence, deterministic compiler, invariant tests.
- Verification: Focused and full server suites passed; committed as `32323f3`.

### Verified Google Calendar and Outlook capability packs

- Original problem: Both applications were detected through the legacy registry but lacked bounded K2 operations; Outlook was blanket-rejected during grounding.
- Implemented rule: Add only repository-verified Calendar find/create/update event operations and Outlook new-email/send-email/create-draft operations for n8n, Make, and Zapier. Retain unsupported states for unverified operations.
- Affected subsystem: Knowledge application packs, Stage C selection, scope retrieval, and catalog/grounding tests.
- Verification: 21 knowledge tests and 478 server tests passed; committed as `0719588`.

## Current checkpoint

### Workflow Brief schema foundation

- Phase B Sprint 1 added strict actors, applications, triggers, actions, parse helpers, and foundational cross-reference validation.
- Phase B Sprint 2 added business-level control-flow contracts for decisions/routes, loops, waits, approvals, merges, iterators, and aggregators. Semantic labels and control references are validated without platform node details or runtime integration.
- Phase B Sprint 3 added strict evidence, confidence, clarification, conceptual capability, review-decision, and review/lock-state contracts. A shared typed entity-reference resolver validates traceability, and locked briefs enforce business-level review eligibility without compiling or executing anything.
- Phase B Sprint 4 hardened the v1.0 contract with schema-derived public constants, validate-before-serialize JSON round trips, six breadth fixtures, fourteen stable invalid cases, public-index compatibility coverage, and `docs/workflow-brief-contract.md`. No runtime behavior or package dependencies changed.
- Phase C Sprint 1 added the strict conceptual node-function catalog foundation with 23 entries and one detailed Router contract. The Router preserves semantic business labels independently of downstream action names and distinguishes routing from binary decisions, parallel fan-out, iteration, retry, and sequential actions. No detection or runtime behavior was added.
- Phase C Sprint 2 promoted Binary Decision and five Loop-family entries to detailed contracts. The catalog now distinguishes technical retry, communication follow-up, feedback-driven revision, interval-based polling, and return to a named earlier step, with shared Workflow Brief compatibility tests and stronger detailed-contract invariants.
- Phase C Sprint 3 promoted Wait, Approval, Merge, Iterator, and Aggregator to detailed contracts. Their safeguards preserve wait boundaries, active human decisions, synchronization strategy, collection-source ordering, optional aggregation, and Iterator/Aggregator agreement, with shared compatibility and invalid-case coverage.
- Phase C Sprint 4 promoted Trigger, Action, Filter, Error Handler, Sub-workflow, and Terminal to detailed contracts. The catalog now preserves primary start conditions, single-operation clarity, one-sided gating, retry-exhaustion handling, reusable process boundaries, and final outcomes with no continuation.
- Phase C Sprint 5 promoted AI Agent, AI Classification, AI Extraction, AI Summarization, and AI Generation to detailed contracts. The catalog now distinguishes bounded open-ended interaction, known-category labeling, defined-field extraction, faithful summarization, and one-artifact generation with deterministic-first, evidence, review, clarification, and human-boundary safeguards. No runtime AI configuration or behavior was added.
- Phase C Sprint 6 completed the 23-entry catalog audit, removed obsolete empty foundation scaffolding, added frozen derived catalog constants and pure structured validation, verified every category and Workflow Brief relationship, strengthened implementation-leakage checks, and locked cross-contract and public immutability guarantees. Phase C is complete with no new conceptual function required.
- Phase D Sprint 1 added the strict v1.0 capability-detection result, exact requirement-offset evidence, detection-only confidence bands, ambiguity and clarification references, catalog-backed candidates, a synchronous detector interface, a no-op reference detector, and pure Workflow Brief metadata previews. No actual detection rule or runtime behavior was added.

Current validation is 30/30 real-world scenarios, average score 91, capability safety 100%, 478 server tests passed with 4 skipped, and a passing complete project typecheck.
