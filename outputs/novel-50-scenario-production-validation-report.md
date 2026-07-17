# Novel 50-Scenario Production Validation

## Method

Fifty new requests were created across distinct business contexts, including healthcare, property, hospitality, construction, insurance, education, veterinary care, nonprofit work, utilities, agriculture, manufacturing, transportation, public services, publishing, cybersecurity, marine services, forestry, sports, and other industries.

None reused an original benchmark scenario or its wording. The existing built planner, Stage C, and Stage D artifacts were executed without modifying source code, knowledge, capability packs, persistence, or application behavior.

The same acceptance principles were applied:

- at least 70% expected canonical-function coverage;
- at least 75% explicitly expected application coverage;
- required branch topology present;
- compiler and Stage D structural validation clean;
- no invalid capability reference, role mismatch, or cardinality mismatch;
- overall score of at least 70.

## Validation summary

| Metric | Result |
| --- | ---: |
| Scenarios | 50 |
| Passed | 14 |
| Failed | 36 |
| Pass rate | 28% |
| Average score | 75/100 |
| Branch pass rate | 62% |
| Capability safety | 100% |

## Recurring weaknesses

1. **Synonym sensitivity**
   - Recognition remains sensitive to exact words such as “request approval,” “notify,” “retrieve,” “route,” and explicit application names.
   - Natural alternatives including “must be reviewed,” “alert the manager,” “fetch,” “switch by severity,” and “email the owner” are inconsistently mapped.

2. **Multi-route generalization**
   - Seven router scenarios missed `multi-route-decision`.
   - Lists expressed as regions, languages, departments, or categories were less reliable than the original benchmark’s route phrasing.

3. **Approval-language coverage**
   - Six workflows missed human approval when business language used “reviewed by,” “needs manager sign-off,” or sequential role review rather than the known approval templates.

4. **Notification provider ambiguity**
   - Twelve failed cases missed notification semantics.
   - Generic “email” correctly does not always prove Gmail; however, the workflow often lacked an explicit unresolved channel/application representation.

5. **Collection retrieval and iterator cardinality**
   - Seven cases missed retrieval and several collection workflows produced Stage D cardinality mismatches.
   - Alternate collection nouns such as patients, memberships, products, permits, and leases remain less reliable than attachments/items/rows.

6. **Validation and binary-condition phrasing**
   - Five validation and five binary-condition expectations were missed when conditions used domain-specific language such as sufficient budget, safe readings, passing quality, or active warranty.

7. **Aggregation without explicit iterator wording**
   - Summary/report workflows sometimes produced an orphaned aggregator invariant when the request described collecting and aggregating records without saying “each” or “iterate.”

## False negatives

Most frequent missing canonical functions among failed cases:

| Function | Cases |
| --- | ---: |
| Notification | 12 |
| Multi-route decision | 7 |
| Data retrieval | 7 |
| Human approval | 6 |
| Logging | 6 |
| Binary condition | 5 |
| Validation | 5 |
| Action | 3 |
| Delay | 2 |
| Loop | 2 |
| Merge | 2 |

Application false negatives were concentrated around generic email language, implicit inbound web requests, and schedules where the request did not name a connector. These should become explicit unresolved requirements rather than silently selecting an application.

## False positives

Most frequent unexpected canonical functions among failed cases:

| Function | Cases |
| --- | ---: |
| Action | 15 |
| Aggregator | 10 |
| Data transformation | 7 |
| Merge | 6 |
| Manual review | 6 |
| Iterator | 3 |
| Binary condition | 2 |

The dominant causes were:

- collection skeletons adding generic Action and Aggregator nodes even when the request only required per-item notification;
- approval and binary patterns adding Merge, Manual Review, and Data Transformation support nodes beyond stated business behavior;
- generic internal topology being structurally safe but more complex than a consultant-ready workflow.

## Production readiness assessment

**Not ready for unrestricted production generation across arbitrary industries.**

The engine is safe: no fabricated capability references or unsafe operation selections occurred in any scenario. It is also strong on the curated benchmark. However, the 28% novel-scenario pass rate and 62% branch pass rate show that deterministic language coverage is still too narrow for broad self-service use.

Recommended readiness:

- suitable for controlled beta with supported request templates, visible clarifications, and human review;
- not suitable for automatic client delivery from unrestricted natural-language scopes;
- production promotion should require a materially stronger unseen-scenario pass rate, especially for routing, approvals, notifications, domain-specific conditions, and collection cardinality.

No application or architecture changes were made during this validation.
