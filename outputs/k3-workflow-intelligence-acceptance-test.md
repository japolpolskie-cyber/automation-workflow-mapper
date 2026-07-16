# K3 Workflow Intelligence Acceptance Test

Date: 2026-07-16  
Scope: K3 deterministic analysis only. No provider or workflow generation was invoked.  
Scenarios: 25 real-world requests across CRM, sales, marketing, support, HR, recruitment, finance, Google Workspace, Microsoft 365, Shopify, Facebook Lead Ads, Slack, Asana, Trello, Monday.com, generic API, and email automation.

## Executive decision

**REVISE K3 BEFORE K4**

K3 is fast, auditable, conservative about its initial six patterns, and reliable for explicitly named applications that exist in the seven K2 packs. Binary questions and service-type multi-route decisions work well. However, product acceptance exposed material semantic gaps that should be corrected before K4 grounds Qwen prompts on K3 output:

1. Application detection is restricted to the seven K2 packs and misses common applications already present in the legacy registry.
2. Cardinality is document-global rather than step-scoped. “Every 2 days” can become a collection and “for each lead, add one row” creates a false collection/single conflict.
3. Filter, merge, aggregator, iterator, loop, and retry semantics are not emitted as detected facts.
4. Clarification rules frequently ignore explicit owners and explicit false paths.
5. Overall fact confidence is not calibrated against coverage. A scenario can score 98% while its primary application and cardinality are undetected.
6. Retrieval is deterministic and bounded, but sparse operation matching and unconditional manual retrieval reduce relevance.

## Method

Each scenario was passed directly to `ScopeIntelligenceService.analyze()`. The acceptance harness recorded facts, evidence types, rule IDs, clarification IDs, selected knowledge, character budget, and wall-clock duration. No workflow was generated.

“Overall completeness” is an acceptance-review heuristic based on missing/incorrect classifications and clarification burden. K3 currently has no native overall-completeness contract; that omission is itself a finding.

## Scenario results

Abbreviations: Apps = applications; Ent = entities; Verbs = business verbs; Dec = decisions; Coll = cardinality; Rep = repeated work; Pat = patterns; Clar = clarifications; Conf = mean detected-fact confidence; Comp = acceptance completeness; K = retrieved characters of 12,000.

### 1. CRM upsert — CRM

- Request: HubSpot contact arrives; find by email; create or update; log.
- Apps: none. Ent: email, record. Verbs: create, update, find, log.
- Dec/routes/coll/rep/patterns: none.
- Clar: none.
- Evidence/rules: Explicit; `verb.create`, `verb.update`, `verb.find`, `verb.log`, `entity.email`, `entity.record`.
- Knowledge: 206/12,000; manuals `clarification-manual`; no application, operation, or pattern.
- Conf: 97.7%. Comp: 65%.
- Finding: HubSpot and Create or Update Record were missed; confidence is materially too high.

### 2. Sales lead routing — Sales

- Apps: Slack. Ent: lead. Verbs: notify.
- Dec: multi-route. Routes: Cleaning, Repair, Installation. Coll/rep: none.
- Pat: Service-Based Routing. Clar: none.
- Evidence: Explicit, semantic, pattern, derived.
- Rules: `application.slack`, `decision.service-routes`, `route.*`, `pattern.service-based-routing.*`.
- Knowledge: 4,117/12,000; `multi-route-manual`, `clarification-manual`, service pattern, Slack pack.
- Conf: 96.6%. Comp: 80%.
- Finding: routing was correct; Salesforce application was missed.

### 3. Marketing campaign — Marketing

- Apps: Google Sheets, Gmail. Ent: lead, row, email. Verbs: send, validate.
- Coll: collection. Rep: repeated work. Decisions/patterns: none.
- Clar: collection versus single.
- Evidence: Explicit, linguistic, missing information.
- Rules: application rules, `cardinality.collection`, `cardinality.single-conflict`, entity/verb rules.
- Knowledge: 5,073/12,000; iterator and clarification manuals; Sheets/Gmail packs; Gmail Send Email and Sheets Add Row.
- Conf: 77.5%. Comp: 75%.
- Finding: Facebook Lead Ads missed. “For each submission” plus “one row” is compatible, not conflicting; clarification is false.

### 4. Support escalation — Customer Support

- Apps: Slack. Verbs: notify. Other entities absent.
- Decisions/routes/coll/rep/patterns: none.
- Clar: ambiguous false path.
- Evidence: Explicit, linguistic, missing information.
- Rules: `application.slack`, `condition.present`, `clarification.ambiguous-false-path`.
- Knowledge: 307/12,000; clarification manual and Slack pack.
- Conf: 76.6%. Comp: 45%.
- Finding: Zendesk and the replied/otherwise binary decision were missed. False-path clarification is incorrect because “otherwise escalate” is explicit.

### 5. HR onboarding — HR

- Apps: Google Drive, Gmail. Ent: folder. Verbs: create, send.
- Decisions/coll/rep/patterns: none.
- Clar: duplicate-handling policy.
- Evidence: Explicit and missing information.
- Rules: application, verb, entity, `create.present`, duplicate clarification.
- Knowledge: 3,594/12,000; clarification manual; Drive/Gmail packs; Create Folder and Send Email.
- Conf: 92.0%. Comp: 80%.
- Finding: “manager approves” was not recognized as approval; duplicate clarification is defensible but overly generic for folder creation.

### 6. Recruitment attachments — Recruitment

- Apps: Google Drive, Google Sheets. Ent: attachment. Verb: log.
- Coll: collection. Rep: repeated work.
- Pat: Process Approved Collection. Clar: approval owner.
- Evidence: Explicit, linguistic, pattern, derived, missing information.
- Rules: collection, repetition, pattern, `approval.present`.
- Knowledge: 7,085/12,000; iterator/clarification manuals; pattern; Drive/Sheets packs; Sheets Add Row.
- Conf: 91.6%. Comp: 93%.
- Finding: correct. Upload File operation was not retrieved despite explicit upload language.

### 7. Finance invoice approval — Finance

- Apps/entities: none. Verb: notify.
- Dec: binary. Clar: approval owner; ambiguous false path.
- Evidence: Semantic, explicit, missing information, linguistic.
- Rules: `decision.binary`, approval and condition clarification rules.
- Knowledge: 1,632/12,000; binary/clarification manuals.
- Conf: 71.9%. Comp: 55%.
- Finding: Outlook and Xero missed. Both clarifications are false: finance director is the owner and approved/rejected paths are explicit.

### 8. Google Workspace folder deduplication

- Apps: Asana, Google Drive, Google Sheets. Ent: task, folder, row. Verb: search.
- Coll: single. No decision/pattern/clarification.
- Evidence: Explicit.
- Rules: applications, `cardinality.single`, `verb.search`, entities.
- Knowledge: 3,846/12,000; clarification manual; three packs; Find Folder and Add Row.
- Conf: 98.0%. Comp: 80%.
- Finding: single-record classification is correct. Deduplicate Before Create and Create Folder operation were missed.

### 9. Microsoft 365 filing

- Apps: none. Ent: attachment, email. Verb: notify.
- Coll: collection. No patterns/clarifications.
- Evidence: Linguistic and explicit.
- Rules: collection, verb, entity.
- Knowledge: 1,722/12,000; iterator/clarification manuals only.
- Conf: 96.8%. Comp: 45%.
- Finding: Outlook, SharePoint, and Teams missed; confidence is severely over-calibrated.

### 10. Shopify order fulfillment

- Apps: none. Ent: task. Verbs: create, notify.
- Dec: binary. Coll: collection. Rep: repeated work.
- Clar: ambiguous false path; duplicate policy.
- Evidence: Linguistic, semantic, explicit, missing information.
- Rules: cardinality, binary, verb/entity, condition and create clarifications.
- Knowledge: 3,148/12,000; iterator, binary, clarification manuals.
- Conf: 83.1%. Comp: 55%.
- Finding: Shopify missed. Binary is correct. False path is explicit; both clarifications are over-broad for fulfillment.

### 11. Facebook lead nurture

- Apps: Gmail, Slack. Ent: lead. Verbs: send, notify, follow up.
- Coll: collection. Rep: repeated work.
- Pat: Follow Up Until Response; Scheduled Reminder.
- Clar: escalation policy.
- Evidence: Explicit, linguistic, pattern, derived, missing information.
- Knowledge: 11,742/12,000; iterator, binary, clarification manuals; both patterns; Gmail/Slack packs; Gmail Send Email.
- Conf: 91.9%. Comp: 65%.
- Finding: Facebook Lead Ads missed. Collection is a false positive caused by “every 2 days.” Follow-up patterns are correct. Escalation is genuinely unspecified.

### 12. Slack weekly reminders

- Apps: Slack. Ent: task. Verb: send.
- Coll: collection. Rep: repeated work. No pattern/clarification.
- Evidence: Explicit and linguistic.
- Rules: Slack, collection, send, task, repetition.
- Knowledge: 1,823/12,000; iterator/clarification manuals; Slack pack.
- Conf: 95.8%. Comp: 70%.
- Finding: collection is correct for account owners/tasks. Scheduled Reminder was missed because “Every Monday” is unsupported.

### 13. Asana CRM follow-up

- Apps: Asana, Gmail. Ent: lead, task. Verbs: retrieve, send, follow up.
- Dec: binary. Rep: repeated work.
- Pat: Follow Up Until Response.
- Clar: interval, maximum attempts, escalation.
- Evidence: Explicit, semantic, linguistic, pattern, derived, missing information.
- Knowledge: 9,286/12,000; binary/clarification manuals; follow-up pattern; Asana/Gmail packs; Get Task Details and Send Email.
- Conf: 86.6%. Comp: 95%.
- Finding: correct benchmark behavior.

### 14. Trello approved-status workflow

- Apps: Google Drive, Slack. Ent: folder. Verbs: create, notify.
- No decision/coll/pattern.
- Clar: approval owner; duplicate policy.
- Evidence: Explicit and missing information.
- Knowledge: 2,048/12,000; clarification manual; Drive/Slack packs; Create Folder.
- Conf: 88.0%. Comp: 55%.
- Finding: Trello missed. “Approved” is a status label, not necessarily human approval; approval-owner clarification is false.

### 15. Monday.com service routing

- Apps/entities/verbs: none.
- Dec: multi-route. Routes: Cleaning, Maintenance, Repair.
- Pat: Service-Based Routing. Clar: none.
- Evidence: Semantic, explicit, pattern, derived.
- Knowledge: 4,016/12,000; multi-route/clarification manuals; routing pattern.
- Conf: 95.7%. Comp: 75%.
- Finding: decision and routes correct; Monday.com missed.

### 16. Generic API pagination

- Apps: Webhook / Generic API. Ent: record. Verb: retrieve.
- Coll: collection. Rep: repeated work.
- No decision/pattern/clarification.
- Evidence: Explicit and linguistic.
- Knowledge: 1,855/12,000; iterator/clarification manuals; API pack; no operation.
- Conf: 95.8%. Comp: 80%.
- Finding: collection correct. Paginated Request, iterator, and aggregator semantics were not retrieved/detected.

### 17. Bounded email follow-up

- Apps: Gmail. Verbs: send, wait, follow up. Rep: repeated work.
- Pat: Follow Up Until Response; Scheduled Reminder.
- Clar: maximum attempts; escalation policy.
- Evidence: Explicit, linguistic, pattern, derived, missing information.
- Knowledge: 10,125/12,000; binary/clarification manuals; both patterns; Gmail pack and Send Email.
- Conf: 86.1%. Comp: 60%.
- Finding: both clarifications are false: “Stop after 4 attempts” and “escalate to the account owner” are explicit. Scheduled Reminder is false, triggered by “after 4 attempts,” not a schedule.

### 18. Filter invalid leads

- Apps: Google Sheets. Ent: lead, email, record. Verb: validate.
- Coll: collection. Rep: repeated work. No detected decision.
- Evidence: Explicit and linguistic.
- Knowledge: 1,854/12,000; iterator/clarification manuals; Sheets pack.
- Conf: 96.1%. Comp: 65%.
- Finding: collection correct. The discard-unmatched behavior should be a Filter, but no filter fact/manual was produced. Facebook source missed.

### 19. Binary visible paths

- Apps: Asana, Gmail, Slack. Verbs: update, send, notify.
- Dec: binary. No collection/pattern/clarification.
- Evidence: Explicit and semantic.
- Knowledge: 3,472/12,000; binary/clarification manuals; all three packs; Gmail Send Email.
- Conf: 97.7%. Comp: 95%.
- Finding: correct binary-condition behavior and no unnecessary false-path clarification.

### 20. Merge after service routes

- Apps: Google Sheets.
- Dec: multi-route. Routes: Cleaning, Maintenance, Repair.
- Pat: Service-Based Routing. No clarification.
- Evidence: Explicit, semantic, pattern, derived.
- Knowledge: 5,720/12,000; multi-route/clarification manuals; routing pattern; Sheets pack/Add Row.
- Conf: 96.3%. Comp: 70%.
- Finding: routing correct. Explicit Merge was not detected or retrieved.

### 21. Aggregate attachments

- Apps: Google Drive, Gmail. Ent: attachment. Verb: send.
- Coll: collection. Rep: repeated work.
- No decision/pattern/clarification.
- Evidence: Explicit and linguistic.
- Knowledge: 3,488/12,000; iterator/clarification manuals; Drive/Gmail packs; Gmail Send Email.
- Conf: 96.3%. Comp: 70%.
- Finding: collection correct. Explicit Aggregator and Upload File were missed.

### 22. Bounded retry loop

- Apps: Webhook / Generic API, Slack. Verbs: notify, wait.
- No decision/cardinality/repetition/pattern.
- Clar: ambiguous false path.
- Evidence: Explicit, linguistic, missing information.
- Knowledge: 440/12,000; clarification manual; API/Slack packs; no operations.
- Conf: 85.4%. Comp: 50%.
- Finding: retry, bounded loop, wait, and final failure policy were not modeled. False-path clarification is unnecessary because final failure behavior is explicit.

### 23. Single Shopify order

- Apps/entities/cardinality: none. Verbs: update, retrieve.
- No decision/pattern/clarification.
- Evidence: Explicit.
- Knowledge: 206/12,000; clarification manual only.
- Conf: 98.0%. Comp: 35%.
- Finding: Shopify, order entity, and explicit single cardinality were missed. This is the strongest confidence-calibration failure.

### 24. Conflicting cardinality

- Apps: Google Sheets. Ent: row, record.
- Coll: collection with explicit single conflict. Rep: repeated work.
- Clar: collection versus single.
- Evidence: Explicit, linguistic, missing/conflicting information.
- Knowledge: 3,426/12,000; iterator/clarification manuals; Sheets pack/Add Row.
- Conf: 63.8%. Comp: 93%.
- Finding: correct conflict preservation, reduced confidence, and clarification.

### 25. Deduplicated CRM collection import

- Apps: Google Sheets. Ent: lead, row, record. Verbs: create, update, search, log.
- Dec: binary. Coll: collection. Rep: repeated work.
- Pat: Process Approved Collection; Deduplicate Before Create.
- Clar: approval owner; ambiguous false path.
- Evidence: all six evidence types.
- Knowledge: 9,695/12,000; iterator/binary/clarification manuals; both patterns; Sheets pack/Add Row.
- Conf: 89.2%. Comp: 75%.
- Finding: decision and patterns correct. Generic CRM missed. “Approved lead” may be status, so approval clarification is unsafe; found/otherwise paths are explicit, so false-path clarification is false.

## Required distinction review

### Binary Condition vs Multi-Route Decision

- **Pass with limitations.** Direct yes/no questions were correctly binary (scenarios 7, 10, 13, 19, 25).
- Service-type requests with three named outcomes were correctly multi-route (2, 15, 20).
- Semantic binary language using “replied … otherwise” was missed (4).
- Follow-up-until-response does not create a binary-decision fact even though binary capability is retrieved (11, 17).

### Iterator vs Single Record

- **Partial pass.** “For each attachment/record” retrieves the Iterator manual; “one Asana task” produces single cardinality.
- Cardinality is global, not associated with an entity or step. This caused a false conflict in scenario 3 and a false collection in scenario 11.
- “One Shopify order” was not recognized because the single-record noun list is narrow.

### Filter vs Binary Condition

- **Fail.** K3 detects some binary decisions but emits no Filter fact. Scenario 18 clearly describes unmatched records stopping and was not classified.

### Merge vs Aggregator

- **Fail.** Explicit Merge (20) and Aggregator (21) were not detected or retrieved. K3 therefore cannot demonstrate this distinction.

### Loop vs Repeated Actions

- **Fail/partial.** K3 emits generic `repeated-work`, but no Loop fact. Bounded retry (22), pagination (16), follow-up loop (13/17), and collection iteration are not structurally distinguished.

### Explicit vs Semantic vs Pattern vs Derived evidence

- **Pass.** Explicit applications/verbs, semantic decisions, multi-signal pattern evidence, and derived pattern evidence were auditable with rule IDs and source text.
- Derived evidence traceability works, but confidence remains coverage-insensitive.

### Missing vs Conflicting information

- **Pass for direct cardinality conflict** in scenario 24.
- **Weak for business semantics:** false missing-information clarifications occur when explicit information uses unsupported wording or appears in a status label.

## False-positive report

### Application

No application false positives were observed.

### Iterator / collection

1. Scenario 11: “every 2 days” was treated as a collection signal; it is timing.
2. Scenario 3: “for each submission” and “one row” produced a conflict; one row per collection item is compatible.

### Pattern

1. Scenario 17: Scheduled Reminder was triggered by “after 4 attempts,” which describes a stop boundary, not a schedule.

### Decision / route

No false binary or multi-route facts were observed. No route false positives were observed.

### Clarification

- Scenario 3: false cardinality conflict.
- Scenario 4: false-path behavior already says otherwise escalate.
- Scenario 7: finance director is the approval owner; approved/rejected paths are explicit.
- Scenario 10: otherwise path is explicit; generic duplicate policy is not necessarily required for fulfillment-task creation.
- Scenario 14: Approved is a Trello status, not proof of human approval.
- Scenario 17: attempt limit and escalation owner are explicit.
- Scenario 22: final failure behavior is explicit.
- Scenario 25: found/otherwise paths are explicit; Approved may be a status.

## False-negative report

### Applications

- HubSpot (1), Salesforce (2), Facebook Lead Ads (3, 11, 18), Zendesk (4), Outlook (7, 9), Xero (7), SharePoint (9), Teams (9), Shopify (10, 23), Trello (14), Monday.com (15), and Generic CRM (25).
- Cause: K3 application detection only iterates K2 application packs instead of adapting the full legacy registry.

### Decisions

- Scenario 4 semantic replied/otherwise binary.
- Scenario 18 Filter.
- Follow-up response checks in 11 and 17 are not represented as decisions.

### Iterator / collection / single

- K3 retrieves Iterator rather than emitting an iterator fact.
- Explicit single order in 23 was missed.
- Single contacts, employees, invoices, tickets, and cards are generally not recognized because noun coverage is narrow.

### Patterns

- Create or Update Record in 1.
- Deduplicate Before Create in 8.
- Scheduled Reminder for “Every Monday” in 12.
- Retry/pagination patterns do not exist in the initial pattern set, but their absence limits loop intelligence.

### Clarifications

- Unknown/unsupported primary application is never clarified.
- Scenario 16 lacks pagination boundary/error clarifications.
- Scenario 22 lacks retry exhaustion and retryable-error clarifications.
- Scenarios with unnamed destination IDs/channels are not consistently clarified.

## Confidence review

### Too high

- Scenario 23: 98.0% with Shopify, order entity, and single cardinality all missing.
- Scenario 1: 97.7% with HubSpot and primary upsert pattern missing.
- Scenario 9: 96.8% with all three Microsoft applications missing.
- Scenario 12: 95.8% despite missing Scheduled Reminder.
- Scenarios 16, 20, and 21 exceed 95% while missing pagination/aggregator/merge semantics.

Root cause: average fact confidence measures confidence in detected facts, not coverage of required facts.

### Too low

- Scenario 3: 77.5% due to a false global cardinality conflict.
- Scenario 7: 71.9% due to two false missing-information findings.
- Scenario 17: 86.1% is reduced by two false clarifications.

### Should have clarified

- Unsupported/unknown primary applications.
- Unresolved connector/platform availability when a named application has no operation pack.
- Pagination limit/termination and retryable error policy.

### Correct conflict reduction

- Scenario 24 reduced to 63.8% and exposed both collection and single evidence. This is the strongest confidence behavior in the suite.

## Retrieval review

All scenarios used a 12,000-character budget. Average retrieved: 3,997 characters; average unused: 8,003.

| # | Used | Unused | Manuals | Patterns | Application packs | Relevance |
|---:|---:|---:|---|---|---|---|
|1|206|11,794|Clarification|—|—|Poor: HubSpot/upsert absent|
|2|4,117|7,883|Multi-route, Clarification|Service routing|Slack|Good except Salesforce absent|
|3|5,073|6,927|Iterator, Clarification|—|Sheets, Gmail|Mixed; false iterator conflict|
|4|307|11,693|Clarification|—|Slack|Poor; Zendesk/decision absent|
|5|3,594|8,406|Clarification|—|Drive, Gmail|Good operations; approval missed|
|6|7,085|4,915|Iterator, Clarification|Approved collection|Drive, Sheets|Good; Upload File absent|
|7|1,632|10,368|Binary, Clarification|—|—|Poor; Outlook/Xero absent|
|8|3,846|8,154|Clarification|—|Asana, Drive, Sheets|Mixed; dedup/create absent|
|9|1,722|10,278|Iterator, Clarification|—|—|Poor; M365 apps absent|
|10|3,148|8,852|Iterator, Binary, Clarification|—|—|Mixed; Shopify absent|
|11|11,742|258|Iterator, Binary, Clarification|Follow-up, Reminder|Gmail, Slack|Over-retrieved due false collection|
|12|1,823|10,177|Iterator, Clarification|—|Slack|Missing reminder pattern|
|13|9,286|2,714|Binary, Clarification|Follow-up|Asana, Gmail|Good|
|14|2,048|9,952|Clarification|—|Drive, Slack|Mixed; Trello absent|
|15|4,016|7,984|Multi-route, Clarification|Service routing|—|Good semantics; Monday absent|
|16|1,855|10,145|Iterator, Clarification|—|API|Sparse; pagination/aggregator absent|
|17|10,125|1,875|Binary, Clarification|Follow-up, Reminder|Gmail|Mixed; false reminder|
|18|1,854|10,146|Iterator, Clarification|—|Sheets|Poor; Filter absent|
|19|3,472|8,528|Binary, Clarification|—|Asana, Gmail, Slack|Good|
|20|5,720|6,280|Multi-route, Clarification|Service routing|Sheets|Mixed; Merge absent|
|21|3,488|8,512|Iterator, Clarification|—|Drive, Gmail|Mixed; Aggregator absent|
|22|440|11,560|Clarification|—|API, Slack|Poor; retry/loop absent|
|23|206|11,794|Clarification|—|—|Poor; Shopify/single absent|
|24|3,426|8,574|Iterator, Clarification|—|Sheets|Relevant for the detected conflict|
|25|9,695|2,305|Iterator, Binary, Clarification|Approved collection, Dedup|Sheets|Good patterns; CRM absent|

The `clarification-manual` is retrieved in all 25 scenarios, including scenarios without clarifications. This is deterministic but not strictly selective. Operation retrieval is too phrase-sensitive: explicit upload, pagination, merge, aggregator, and several notifications retrieve no matching operation.

## Performance

- Average K3 analysis time: **3.372 ms**
- Fastest: **0.657 ms** (single Shopify order)
- Slowest: **14.808 ms** (aggregate attachments; cold/run variance included)
- Average knowledge retrieved: **3,997 characters**
- Average unused budget: **8,003 characters**
- Average detected-fact confidence: **89.8%**
- Average acceptance completeness: **94.4% by clarification-count heuristic**, but **approximately 72% after semantic acceptance corrections**.

The 94.4% raw heuristic is misleading because K3 does not penalize undetected facts. A native coverage-aware completeness score is required.

## Final review answers

### 1. Is K3 reliable enough to become the foundation for K4?

Not yet. Its evidence model is a strong foundation, but prompt grounding would amplify incorrect cardinality, missing application capabilities, and false clarifications.

### 2. What are the weakest deterministic rules?

Global cardinality keywords, approval-owner detection, ambiguous false-path detection, single-record noun matching, operation phrase matching, and coverage-insensitive confidence.

### 3. Which patterns produce the most false positives?

Scheduled Reminder is weakest because generic “after N” phrases match stop boundaries. Process Approved Collection can misread status labels such as Approved as human approval. Follow Up Until Response was otherwise reliable.

### 4. Which clarification rules should be improved?

Approval owner, false path, maximum attempts, escalation policy, duplicate handling, and cardinality conflict. They need clause/step scope and broader explicit-wording support.

### 5. Which evidence rules should receive additional weight?

Explicit named outcomes (`if yes/if no`, `approved/rejected`, `found/otherwise`), explicit owners/roles, explicit numeric stop limits, and entity-scoped cardinality phrases.

### 6. Which evidence rules should receive less weight?

Unscoped `every`, bare `approved`, generic `if`, generic `create`, and broad `after N` timing signals.

### 7. Are patterns overlapping incorrectly?

Yes. Follow Up Until Response plus Scheduled Reminder can be correct, but scenario 17 demonstrates overlap caused by a stop-limit phrase. Collection and scheduled repetition also overlap because `every` is context-free.

### 8. What should be improved before K4 changes Qwen prompts?

1. Introduce clause/step segmentation and bind evidence to entities and operations.
2. Resolve applications through the full legacy registry, then mark missing K2 packs/capabilities explicitly.
3. Add deterministic facts/manual retrieval for Filter, Iterator, Loop, Merge, Aggregator, Retry, and Error Handler.
4. Make cardinality entity-scoped and distinguish frequency from collection quantifiers.
5. Expand explicit owner, stop-limit, escalation, and false-path wording.
6. Distinguish status labels from human approval.
7. Add coverage-aware completeness and cap overall confidence when primary applications, trigger, or outcome semantics are missing.
8. Retrieve clarification manuals only when uncertainty exists and improve operation matching with structured verb/entity rules.
9. Add these 25 scenarios as versioned product acceptance benchmarks after rules are revised.

## Recommendation

**REVISE K3 BEFORE K4**

K3 should remain in shadow mode. The recommended revision is bounded and does not require changing Qwen prompts, workflow generation, or persisted data. Once the eight improvements above pass this same 25-scenario suite with materially fewer false positives/negatives and coverage-aware confidence, K4 can safely begin.
