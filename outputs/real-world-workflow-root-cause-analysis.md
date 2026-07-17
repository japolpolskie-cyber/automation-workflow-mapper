# Real-World Workflow Validation Root-Cause Analysis

## Scope and constraints

This analysis reviews the 30-scenario validation benchmark (2 strict passes, 28 strict failures, average score 68/100, capability safety 100%). It changes no application code, planner behavior, compiler behavior, workflow engine, SDK, persistence, database, or UI.

The analysis treats strict failure as a product-readiness signal, not proof that the entire workflow was unusable. Several failed scenarios had correct applications, safe capability handling, or correct collection topology but missed one or more required business functions.

## Executive root-cause summary

The failures are concentrated in a small number of deterministic knowledge and fact-detection gaps. The topology compiler and capability-safety boundary are not the primary causes.

| ID | Shared root cause | Affected failed scenarios | Estimated impact | Failure domain |
|---|---|---:|---|---|
| RC1 | Clause-level business-function recognition is too narrow | 1, 2, 4, 6-11, 14, 16, 19-21, 24-29 | Very High | Knowledge / capability selection |
| RC2 | Human-approval intent is not consistently distinguished from business status | 2-5, 12, 13, 15, 18, 30 | High | Knowledge / branching |
| RC3 | General binary IF/Else intent is under-detected | 1, 5, 15, 29, 30 | High | Knowledge / branching |
| RC4 | Multi-route detection is limited to narrow service-routing language | 6, 10 | Medium | Knowledge / branching |
| RC5 | Ordered multi-step intent loses semantic roles during decomposition | 1, 2, 4-16, 19-21, 24-30 | Very High, overlaps RC1-RC4 | Reasoning / fact extraction |
| RC6 | Application capability coverage is incomplete for several real platforms | 7, 12, 19, 22, 24, 26, 27, 28, 29 | Medium | Platform knowledge / capabilities |
| RC7 | Capability selection and validation reporting over-penalize safe internal controls or ambiguous candidates | 22 and diagnostic noise in several scenarios | Low-Medium | Capability selection / reporting |

### What is not a root cause

- Iterator detection performed correctly for explicit collection scenarios. Changing it would add regression risk without addressing the failures.
- Follow-up-until-response behavior is a current strength; both related benchmark scenarios passed.
- Capability safety is not failing. Unsupported applications and operations remained explicit instead of being fabricated.
- A new planner or model is not justified. Existing deterministic stages can use richer facts and knowledge.

## Detailed root causes

### RC1 — Clause-level business-function recognition

Description: Retrieval, notification, logging, validation, and delay language is frequently collapsed into a generic action or omitted. Common verbs such as find, look up, fetch, notify, alert, record, log, verify, validate, and wait are not recognized consistently within the clause that owns them.

Why it fails: Current deterministic rules cover a useful but narrow set of phrases and patterns. In long scopes, the dominant verb or application can overshadow secondary operations.

Affected capabilities:

- Data retrieval/search: approximately 15-17 scenarios.
- Notification: approximately 12-14 scenarios.
- Logging: approximately 7 scenarios.
- Validation: 3 scenarios.
- Delay/wait: at least 1 scenario.

Smallest correction: Extend versioned, clause-scoped workflow-function rules and their knowledge manuals. Preserve each matched function as an ordered fact. Do not change topology construction.

### RC2 — Approval recognition versus business status

Description: The engine often recognizes words such as approved as a status but does not emit a Human Approval fact when the request explicitly asks a person or role to review, approve, or reject.

Why it fails: Status transitions and approval acts share vocabulary. Existing safeguards correctly avoid treating every approved status as human approval, but the positive evidence rule is now too restrictive.

Affected scenarios: Customer onboarding, employee onboarding, invoice approval, purchase request approval, leave approval, marketing campaign approval, customer support escalation, contract approval, and multi-step conditional approval.

Smallest correction: Add an explicit approval-act rule requiring actor/reviewer evidence plus an approve/reject/request-review verb. Continue treating passive status values as business status. Ambiguous cases must remain clarifications.

### RC3 — General binary IF/Else recognition

Description: Explicit two-outcome business questions and threshold rules do not always become Binary Condition facts.

Why it fails: Existing binary detection is strongest for known question forms such as response checks. It is weaker for conditional clauses using if, otherwise, above/below, found/not found, or valid/invalid.

Affected scenarios: CRM lead management, purchase request approval, customer support escalation, Google Calendar scheduling, and multi-step conditional approval.

Smallest correction: Add evidence-backed binary rule templates for explicit two-outcome clauses. Require exactly two meaningful outcomes; do not reinterpret unmatched-record filters as binary decisions.

### RC4 — General multi-route recognition

Description: Enumerated category routing is not consistently emitted as Multi-Route Decision.

Why it fails: Router knowledge is biased toward service-based routing phrases and misses category lists such as Hardware/Software/Access or file-type destinations.

Affected scenarios: IT helpdesk routing and Google Drive organization.

Smallest correction: Recognize explicit three-or-more labeled alternatives or phrases such as route by category/type/department. Preserve route labels and require an unknown/default route clarification when absent.

### RC5 — Ordered multi-step semantic decomposition

Description: Many scopes contain several independent operations in one paragraph. The engine detects applications but does not retain every clause's function, entity, inputs, and order.

Why it fails: Segmentation exists, but semantic role extraction and ordered fact assembly remain uneven. This causes downstream retrieval and compiler inputs to be incomplete even when topology rules are available.

Affected scenarios: Most multi-step failures, overlapping RC1-RC4.

Smallest correction: Strengthen the existing clause-to-fact mapping rather than add a new planning stage. Every actionable clause should emit zero or more evidence-backed facts with order and entity scope.

### RC6 — Platform capability coverage

Description: Several applications are detected but lack verified operation packs or exact mappings. Google Calendar and Trello are prominent gaps; Shopify, Outlook, Airtable, Stripe, ClickUp, and similar applications have partial or ambiguous coverage.

Why it fails: The safety design correctly refuses to invent operations. A safe limitation therefore lowers practical buildability and strict benchmark scores.

Smallest correction: Expand capability packs only after generic fact detection improves, beginning with the highest-frequency missing applications and only verified operations.

### RC7 — Capability selection and validation reporting

Description: A scenario can contain the correct applications, functions, and branching yet fail strict scoring because multiple supported operations remain unresolved or internal workflow-control nodes are reported like missing application operations.

Why it fails: Candidate ranking lacks enough clause-specific discrimination, while diagnostic output does not always separate application-neutral controls from actual capability gaps.

Affected scenario: Airtable synchronization is the clearest case. Similar messages appear as noise elsewhere.

Smallest correction: Add deterministic tie-breaking using exact application, entity, canonical function, and clause verb. Mark compiler-owned controls as intentionally application-neutral in validation reports.

## Failed-scenario mapping

| # | Scenario | Primary causes | Smallest targeted improvement |
|---:|---|---|---|
| 1 | CRM lead management | RC1, RC3, RC5 | Retrieve/validate rules plus explicit two-outcome condition detection |
| 2 | Customer onboarding | RC1, RC2, RC5 | Approval-act and logging facts |
| 3 | Employee onboarding | RC2 | Explicit reviewer approval fact |
| 4 | Invoice approval | RC1, RC2, RC5 | Retrieval plus approval-act facts |
| 5 | Purchase request approval | RC2, RC3, RC5 | Approval, threshold condition, and notification facts |
| 6 | IT helpdesk routing | RC1, RC4, RC5 | Enumerated router, notification, merge, and logging facts |
| 7 | Shopify fulfillment | RC1, RC6 | Validation/notification facts; later verified Shopify operations |
| 8 | Inventory alerts | RC1, RC5 | Retrieval and notification facts; iterator already correct |
| 9 | Gmail attachment processing | RC1, RC5 | Attachment retrieval fact; iterator already correct |
| 10 | Google Drive organization | RC1, RC4, RC5 | File retrieval, category router, merge, and logging facts |
| 11 | HR recruitment | RC1, RC5 | Delay and notification facts |
| 12 | Leave request approval | RC2, RC6 | Approval fact; later Google Calendar pack |
| 13 | Marketing campaign approval | RC1, RC2 | Approval and notification facts |
| 14 | Social media scheduling | RC1, RC5 | Retrieval and logging facts; iterator already correct |
| 15 | Customer support escalation | RC1, RC2, RC3, RC5 | Binary decision, notification, and approval/escalation facts |
| 16 | Appointment reminders | RC1, RC5 | Retrieval fact; iterator already correct |
| 18 | Contract approval | RC2 | Approval-act fact |
| 19 | Event registration | RC1, RC6 | Validation fact; later Google Calendar pack |
| 20 | Newsletter automation | RC1, RC5 | Retrieval and specific send/action facts |
| 21 | Slack notifications | RC1, RC5 | Retrieval and notification facts |
| 22 | Airtable synchronization | RC6, RC7 | Deterministic operation tie-break and cleaner control diagnostics |
| 24 | Stripe payment notifications | RC1, RC5, RC6 | Retrieval, notification, and logging facts; verified Stripe mappings later |
| 25 | Asana project creation | RC1, RC5 | Retrieval and notification facts |
| 26 | ClickUp task automation | RC1, RC5, RC6 | Retrieval, logging, notification; verified ClickUp mappings later |
| 27 | Trello card management | RC1, RC6 | Retrieval fact; later Trello capability pack |
| 28 | Outlook email processing | RC1, RC5, RC6 | Retrieval and logging facts; iterator already correct |
| 29 | Google Calendar scheduling | RC1, RC3, RC6 | Retrieval, binary availability decision, notification; Calendar pack later |
| 30 | Multi-step conditional approval | RC1, RC2, RC3, RC5 | Binary, approval, and notification facts |

Scenarios 17 (Sales quote follow-up) and 23 (HubSpot lead nurturing) passed and should become non-regression fixtures.

## Priority roadmap

The estimates are conservative and account for overlap. Each priority should be benchmarked independently before beginning the next.

### Priority 1 — Expand clause-scoped workflow-function knowledge

Scope:

- Add deterministic rules/manual synonyms for retrieval, search, notification, logging, validation, and delay.
- Preserve ordered, entity-scoped facts per actionable clause.
- Add focused fixtures from the failed scenarios.
- No topology, compiler, runtime, or prompt changes.

Estimated direct reach: 18-20 failed scenarios.

Estimated strict pass rate after Priority 1: 10-12 of 30 (33%-40%), from 2 of 30.

### Priority 2 — Approval and binary-condition knowledge

Scope:

- Add actor-plus-approval-act recognition.
- Preserve the distinction between business status and human approval.
- Add explicit two-outcome IF/Else and threshold evidence rules.
- Surface ambiguity as clarification.

Estimated additional reach: 9 approval scenarios and 5 binary scenarios, with overlap.

Estimated cumulative strict pass rate: 19-21 of 30 (63%-70%).

### Priority 3 — General multi-route recognition and capability-selection cleanup

Scope:

- Recognize three-or-more explicit category routes.
- Require labeled routes and clarify missing fallback routes.
- Deterministically rank operation candidates by application, entity, function, and clause verb.
- Treat compiler-owned internal controls as application-neutral in validation reporting.

Estimated additional reach: 3-4 scenarios.

Estimated cumulative strict pass rate: 22-24 of 30 (73%-80%).

### Priority 4 — Targeted capability-pack expansion

Scope:

- Add only verified, high-frequency operations through the existing Capability SDK.
- Start with Google Calendar and Outlook, then Trello and the specific Shopify operations required by the benchmark.
- Keep unsupported mappings explicit.

Estimated additional reach: 2-4 scenarios.

Estimated cumulative strict pass rate: 25-27 of 30 (83%-90%).

## Risk assessment

| Priority | Risk | Main risk | Mitigation |
|---|---|---|---|
| 1 | Medium | Generic verbs such as send or get create false positives | Clause scope, entity binding, exact evidence, and passed-scenario regression fixtures |
| 2 | Medium-High | Business status is incorrectly promoted to human approval | Require actor/reviewer plus approval act; clarify ambiguous cases |
| 3 | Medium | Binary conditions become routers or category mentions become routes | Require exactly two outcomes for binary and at least three explicit alternatives for router |
| 4 | Low architectural / Medium maintenance | Catalog breadth grows faster than verification quality | SDK validation, provenance, versioning, and explicit limitations |

The largest overall risk is improving recall at the expense of deterministic precision. Every new rule should expose evidence, rule ID/version, clause location, and conflict handling. Existing pass scenarios, collection workflows, follow-up patterns, and capability-safety tests must remain mandatory regression gates.

## Recommendation for the next implementation sprint

Implement Priority 1 only: a small deterministic knowledge-extension sprint for clause-scoped retrieval, notification, logging, validation, and delay facts, with ordered entity-scoped output and benchmark fixtures.

This offers the broadest expected pass-rate improvement without changing planner behavior, topology compilation, persistence, UI, prompts, or the model. Stop and rerun all 30 scenarios before approving Priority 2.
