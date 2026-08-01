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

Current validation is 30/30 real-world scenarios, average score 91, capability safety 100%, 478 server tests passed with 4 skipped, and a passing complete project typecheck.
