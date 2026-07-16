# K4 Planner Acceptance Review

## Decision

**C. KEEP K4 SHADOW-ONLY**

K4 is architecturally useful and its grounding boundary works, but the evidence is not sufficient for controlled promotion. The grounded planner must remain non-persisted and must not replace production behavior.

## Review integrity

No application code was modified during this review. K5 was not started.

Three scenarios have real local Qwen output using the final K4 contract. The remaining scenarios received contract, retrieval, and failure-mode review only. They are deliberately marked `NOT LIVE-RUN`; no simulated output is presented as model output, and those scenarios are excluded from averages.

This means the requested 20-scenario live comparison threshold was not met. That is itself a failed promotion criterion.

## Reproducible scoring rubric

Each dimension is scored from 0–5:

| Dimension | 5 | 3 | 1 | 0 |
|---|---|---|---|---|
| Grounding Accuracy | All applications, operations, and facts trace to supplied context | Minor generic references | Important weak or inferred references | Fabricated core references |
| Business Logic Completeness | Trigger, decisions, routes, stopping rules, and outcomes preserved | Main path preserved with gaps | Major logic missing | Objective lost |
| Capability Compliance | All references supported; limitations honored | Workarounds acknowledged | Unsupported behavior suggested | Fabricated capability |
| Clarification Safety | Every missing policy preserved; no assumption | Minor optional omission | Required ambiguity assumed | Contradicts clarification |
| Structural Correctness | Coherent sequence, conditions, routes, iteration, merge, and termination | Usable with corrections | Major structural repair needed | Invalid plan |
| Practical Buildability | Directly implementable operation choices and data flow | Engineer can complete with moderate work | Mostly generic guidance | Not implementable |
| Overall Plan Quality | Weighted result below |

Weights:

- Grounding Accuracy: 20%
- Business Logic Completeness: 20%
- Capability Compliance: 15%
- Clarification Safety: 15%
- Structural Correctness: 15%
- Practical Buildability: 15%

Penalties:

- Invented operation: −15 points each
- Missing required clarification: −12 points each
- Invented business rule: −10 points each
- Missing business branch: −8 points each
- Unnecessary success/failure branch: −4 points each
- Unnecessary node: −2 points each
- Overly generic required step: −3 points each

Longer plans receive no scoring benefit.

## Benchmark corpus

| # | Scenario | Required behavior | Review status |
|---:|---|---|---|
| 1 | Asana CRM | Task-section trigger, task retrieval, Drive folder deduplication, lead response, bounded Gmail follow-up, Sheets log | LIVE |
| 2 | Gmail attachment intake | Gmail trigger, attachment collection, iterator, Drive upload, aggregation, Sheets row | LIVE |
| 3 | Shopify fulfillment | Known Shopify app limitation, item iteration, service router, merge, Slack notification | LIVE |
| 4 | Facebook Lead Ads to CRM | Lead trigger, find/create contact, duplicate policy, Slack notification | NOT LIVE-RUN |
| 5 | Outlook invoice follow-up | Invoice retrieval, scheduled Outlook reminders, stop on payment, escalation | NOT LIVE-RUN |
| 6 | Customer support triage | Ticket intake, severity classification, binary SLA test, multi-team routing | NOT LIVE-RUN |
| 7 | Recruitment screening | Candidate collection, validation, reviewer approval, rejection path | NOT LIVE-RUN |
| 8 | HR onboarding | Approved hire, account/folder tasks, parallel actions, merge, completion | NOT LIVE-RUN |
| 9 | Finance approval | Invoice validation, approval owner, approved/rejected routes, accounting update | NOT LIVE-RUN |
| 10 | Slack incident alert | API incident trigger, deduplication, severity routes, channel notification | NOT LIVE-RUN |
| 11 | Generic API pagination | Authenticated request, pagination loop, iterator, aggregation, rate-limit delay | NOT LIVE-RUN |
| 12 | Drive file approval | File collection, iterator, approval, approved/rejected actions | NOT LIVE-RUN |
| 13 | Scheduled account reminder | Schedule trigger, bounded reminder loop, response stop, escalation | NOT LIVE-RUN |
| 14 | Purchase approval | Request, named approver, approved/rejected outcomes, audit log | NOT LIVE-RUN |
| 15 | Multi-route field service | Service-type router, four named routes, shared merge, notification | NOT LIVE-RUN |
| 16 | Sheets row processing | Row collection, iterator, per-row validation, filtered stop, summary | NOT LIVE-RUN |
| 17 | CRM create-or-update | Search by stable key, found/not-found decision, update/create, merge | NOT LIVE-RUN |
| 18 | Follow-up until response | Channel, interval, maximum attempts, response check, escalation | NOT LIVE-RUN |
| 19 | Gmail-to-Outlook handoff | Gmail trigger, validation, Outlook send, error policy clarification | NOT LIVE-RUN |
| 20 | Employee document processing | Attachments, validation filter, iterator, Drive upload, Sheets audit | NOT LIVE-RUN |

## Live comparison results

### 1. Asana CRM

Production planner:

- The live production-planner call failed after prolonged generation with an Ollama fetch failure.
- Ollama remained reachable and both installed models remained listed.
- No valid production workflow was available to score.

Grounded planner:

- 8 structured steps
- Correct applications: Asana, Google Drive, Gmail, Google Sheets
- Correct catalog operations: Asana task moved to section, Asana task details, Drive find/create folder, Gmail send email, Sheets add row
- Binary condition preserved
- Invalid references: 0
- Prompt: 16,117 characters
- Retrieved knowledge: 11,738 characters
- Latency: 113.0 seconds

Grounded score: **86/100**

Remaining deductions:

- Branch targets are route labels rather than explicit step references.
- The plan schema does not prove that every branch rejoins or terminates.
- The bounded follow-up behavior is represented less explicitly than a build-ready loop structure.

### 2. Gmail attachment intake

Grounded planner:

- 5 structured steps
- Correct Gmail, Google Drive, and Google Sheets applications
- Iterator and Aggregator preserved
- Correct Drive upload and Sheets add-row operations
- Invalid references: 0
- Prompt: 12,396 characters
- Retrieved knowledge: 11,842 characters
- Latency: 65.1 seconds

Grounded score: **88/100**

Remaining deductions:

- The Gmail trigger had no verified operation reference in the final plan.
- Aggregation semantics are named but not fully wired through explicit data dependencies.

Production output for this exact scope was not live-run and is unscored.

### 3. Shopify fulfillment

Grounded planner:

- 5 structured steps
- Shopify retained as a known application
- No Shopify operation was fabricated
- Slack used a verified send-channel-message operation
- Iterator, multi-route decision, merge, and notification preserved
- Invalid references: 0
- Prompt: 14,233 characters
- Retrieved knowledge: 4,546 characters
- Latency: 65.7 seconds

Grounded score: **82/100**

Remaining deductions:

- Shopify has no verified K2 operation pack, so the trigger remains a known limitation rather than a build-ready operation.
- The four service routes are not represented as explicit route-to-step mappings.
- Merge semantics are asserted but not structurally provable from the plan schema.

Production output for this exact scope was not live-run and is unscored.

## Valid aggregate metrics

Only grounded live results have a valid sample:

- Average grounded score: **85.3/100**
- Average grounded latency: **81.3 seconds**
- Invalid application references: **0**
- Invalid operation references: **0**
- Invalid canonical-function references: **0**

The following requested metrics are **not validly calculable**:

- Average production-planner score
- Average latency difference
- Percentage improved
- Percentage unchanged
- Percentage regressed

Reason: only one exact-scope production run was attempted and it failed; the other 17 scenarios were not live-run. Reporting numeric comparisons would fabricate evidence.

## Improvements demonstrated

- Runtime enums materially reduced paraphrased and invented identifiers.
- Known-but-unpacked applications can remain explicit without fabricating operations.
- Unsupported platform operations are excluded from allowed operation references.
- Required clarifications are enforced as a hard acceptance gate.
- Confidence, coverage, reliability, evidence weights, and benchmark metrics are absent from planner context.
- Grounded outputs preserve Iterator, Aggregator, Merge, and multi-route concepts better than generic action-node generation.

## Promotion blockers

1. **Insufficient paired benchmark evidence**
   - The required 20 paired production/grounded runs do not exist.

2. **No buildable graph structure**
   - Steps are ordered, but there are no explicit typed edges, route targets, merge inputs, or loop back-edges.

3. **Branch completeness cannot be proven**
   - `routes: string[]` describes labels, not destination steps.

4. **Loop boundaries are under-specified**
   - The schema does not require initialization, condition, maximum attempts, delay, exit, or escalation linkage.

5. **Evidence references are not integrity-checked**
   - `rationaleEvidenceIds` can be empty or reference unknown evidence.

6. **Limitation acknowledgement is not enforced**
   - `limitationAcknowledgements` exists, but K4 does not require it for workaround or unsupported capabilities.

7. **Operation/function compatibility is not validated**
   - A valid operation reference could still be paired with the wrong canonical function.

8. **Comparison logic is too shallow**
   - Current comparison uses category-set differences, not the acceptance rubric in this document.

9. **High latency**
   - Shadow mode adds a second model call. Grounded runs averaged 81.3 seconds locally.

10. **Production stability evidence is incomplete**
    - The exact Asana production call failed while its grounded counterpart completed.

## Scenarios that must remain shadow-only

At minimum:

- Shopify and any application without a verified operation pack
- Approval workflows until owner and both decision paths are structurally validated
- Follow-up loops until bounded loop structure is enforced
- Multi-route workflows until route targets and merge behavior are explicit
- Generic API pagination until page limits, stop rules, and rate-limit handling are validated
- Finance and HR workflows where missing policy or ownership creates material risk

## Final recommendation

**C. KEEP K4 SHADOW-ONLY**

Do not promote by percentage yet. Continue collecting paired shadow comparisons. Promotion should not be reconsidered until:

- At least 20 exact-scope paired runs complete successfully
- At least 85% of scenarios improve
- No scenario invents an operation, application, canonical function, or business policy
- No required clarification is lost
- No scenario regresses by more than 5 rubric points
- Average grounded quality is at least 85/100
- Structural validation covers explicit branches, route destinations, loop boundaries, merges, and terminal paths
- P95 added shadow latency is measured and accepted

K5 was not started.
