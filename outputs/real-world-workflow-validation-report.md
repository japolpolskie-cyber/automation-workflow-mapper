# Real-World Workflow Generation Validation Report

## Executive summary

The current P4 + Stage C + Stage D workflow path was evaluated against 30 realistic automation requests spanning 14 industries and Zapier, Make, and n8n.

- Passed: **2**
- Failed: **28**
- Average quality score: **68/100**
- Branch expectation pass rate: **56.7%**
- Capability-safety rate: **100%**
- Invalid catalog references: **0**
- Unsupported operations fabricated: **0**; unsupported candidates were rejected safely where encountered
- Estimated production readiness for unattended client delivery: **35% — controlled preview only**

The system is safe and deterministic, but it is not yet complete enough for broad unattended generation. It should remain a planning assistant with human review.

## Method

Each scope ran through deterministic scope intelligence, planner-context retrieval, the P4 deterministic skeleton compiler, Stage C capability grounding, and Stage D semantic edge grounding. No live AI model was required, no workflow was persisted, and no production behavior was changed.

Quality score:

- Expected canonical function selection: 30 points
- Application detection: 15 points
- Required branch topology: 15 points
- Structural and edge validation: 20 points
- Capability safety: 10 points
- Grounding coverage: 10 points

A pass requires at least 70/100, at least 70% expected function coverage, at least 75% application coverage, correct branching, and clean structural validation.

## Scenario results

| # | Scenario | Platform | Score | Result | Primary reason |
|---:|---|---|---:|---|---|
| 1 | CRM lead management | n8n | 64 | Fail | Retrieval, validation, and binary decision were not detected |
| 2 | Customer onboarding | Make | 60 | Fail | Approval and logging semantics were missing |
| 3 | Employee onboarding | n8n | 72 | Fail | Explicit approval did not compile into approval topology |
| 4 | Invoice approval | Make | 60 | Fail | Retrieval and approval semantics were missing |
| 5 | Purchase request approval | Zapier | 59 | Fail | Condition, approval, and notification were missed |
| 6 | IT helpdesk ticket routing | n8n | 58 | Fail | Multi-route, merge, notification, and logging were missed |
| 7 | Shopify order fulfillment | Make | 82 | Fail | Score was high, but validation and notification coverage was below the production threshold; Shopify operations remain unverified |
| 8 | Inventory alerts | Zapier | 57 | Fail | Collection topology worked; retrieval and notification were missed |
| 9 | Gmail attachment processing | Make | 64 | Fail | Iterator and aggregation worked; explicit retrieval classification was incomplete |
| 10 | Google Drive organization | n8n | 51 | Fail | Router, merge, retrieval, and logging were not recognized |
| 11 | HR recruitment | Make | 75 | Fail | Action flow compiled, but delay and notification semantics were incomplete |
| 12 | Leave request approval | n8n | 63 | Fail | Approval topology and notification were missing; Google Calendar pack unavailable |
| 13 | Marketing campaign approval | Make | 67 | Fail | Approval and notification semantics were missing |
| 14 | Social media scheduling | Zapier | 59 | Fail | Collection topology worked; retrieval and logging were incomplete |
| 15 | Customer support escalation | n8n | 64 | Fail | Binary decision, approval, and notification were missed |
| 16 | Appointment reminders | Make | 65 | Fail | Collection/reminder topology worked; retrieval classification was incomplete |
| 17 | Sales quote follow-up | n8n | 86 | **Pass** | Follow-up loop, delay, stopping behavior, apps, and safe grounding were represented |
| 18 | Contract approval | Make | 68 | Fail | Approval phrase did not compile into explicit approval branches |
| 19 | Event registration | Zapier | 75 | Fail | Validation was missed and Google Calendar was not fully represented |
| 20 | Newsletter automation | Make | 55 | Fail | Retrieval and final send action were incomplete |
| 21 | Slack notifications | Zapier | 77 | Fail | Applications were found, but retrieval and notification functions were under-specified |
| 22 | Airtable synchronization | n8n | 71 | Fail | Expected functions and branch existed, but grounding/edge completeness did not meet the structural threshold |
| 23 | HubSpot lead nurturing | Make | 92 | **Pass** | Follow-up-until-response pattern compiled completely and remained capability-safe |
| 24 | Stripe payment notifications | Zapier | 74 | Fail | Retrieval, logging, and notification functions were not selected explicitly |
| 25 | Asana project creation | Make | 82 | Fail | Applications were detected, but retrieval and notification coverage remained below threshold |
| 26 | ClickUp task automation | n8n | 74 | Fail | Only the generic action role was selected; retrieval, logging, and notification were missed |
| 27 | Trello card management | Zapier | 75 | Fail | Retrieval was incomplete and Trello lacks a verified capability pack |
| 28 | Outlook email processing | Make | 60 | Fail | Collection topology worked; retrieval and logging were incomplete |
| 29 | Google Calendar scheduling | n8n | 59 | Fail | Retrieval, binary condition, and notification were missed; Calendar capability was incomplete |
| 30 | Multi-step conditional approval | n8n | 64 | Fail | Nested condition and approval semantics were not compiled |

## Recurring strengths

1. No invalid capability or catalog references were accepted.
2. Unsupported candidates were rejected rather than fabricated.
3. Deterministic follow-up-until-response patterns are strong.
4. Collection/iterator topology is usually recognized when explicit “each/every/all” wording is present.
5. Application detection is substantially stronger than workflow-function detection.
6. Compiler output remains deterministic and non-persistent.

## Recurring weaknesses

1. **Approval detection:** “approved,” “request approval,” and approval/rejection language frequently remains a business status instead of becoming human-approval.
2. **Ordinary binary conditions:** Natural “if/otherwise” statements often fail to become explicit TRUE/FALSE topology.
3. **Business function classification:** Retrieve/search, validate, notify, and log verbs are often reduced to a generic action.
4. **Router detection:** Multi-route compilation relies on narrow service-routing phrasing and misses general category routing.
5. **Application capability coverage:** Google Calendar, Trello, Shopify, Airtable, HubSpot, Stripe, ClickUp, and Outlook can be identified, but several lack verified operation packs.
6. **Grounding ambiguity:** Some nodes retain multiple equally valid operations when no optional semantic selector is configured.
7. **Reporting noise:** Internal nodes such as End, Iterator, Merge, and Loop are correctly application-neutral but appear in unresolved-operation reporting.

## Smallest recommended improvements

No changes were implemented during this sprint.

1. Add deterministic scope-intelligence rules for explicit approval verbs and approved/rejected outcomes.
2. Broaden binary-condition rules for clause-level “if,” “otherwise,” “when true,” and “when false.”
3. Add narrow verb-to-function rules for retrieve/search, validate, notify, and log, with clause-scoped evidence.
4. Generalize the existing multi-route rule to explicit category lists without changing router architecture.
5. Mark internal control nodes as intentionally application-neutral in Stage C reporting.
6. Expand capability packs separately, starting with Google Calendar and Outlook; do not compensate by inventing operations.

These are additive rule/catalog improvements and do not require planner redesign.

## Production-readiness recommendation

**Controlled preview only (35%).** The engine is safe enough for supervised evaluation because it avoids fabricated capabilities and invalid references. It is not ready for unattended client delivery because 28 of 30 scenarios miss required business functions or branches under a strict production-quality rubric.
