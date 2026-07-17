# Remaining Eight Benchmark Improvements

## Result

The benchmark improved from 22/30 to 23/30 without changing persistence, the database, compiler structure, UI, or planner pipeline. Capability safety remains 100%, branch correctness remains 100%, and no previously passing scenario regressed.

## Verified isolated correction

### Airtable synchronization

- Detected applications and functions were already complete.
- The Generic CRM `find-record` operation was present and supported, but Stage C selected Gmail `search-email` for the pattern node because the generic “Search for existing record” purpose lacked a bounded CRM record phrase rule.
- Added one exact deterministic operation-selection phrase mapping:
  - “find/search existing/matching record/contact/lead/customer”
  - application: `generic-crm`
  - operation: `find-record`
- Result: the retrieval now produces a single record, removes the collection-to-binary-condition mismatch, and the scenario passes.

## Remaining failures and exact reasons

1. **Inventory alerts**
   - Scope intelligence correctly detects Google Sheets, Slack, collection processing, retrieval, and notification.
   - The existing collection-pattern skeleton emits only Iterator → Action → Aggregator, omitting the detected retrieval and notification nodes.
   - Stage D also reports iterator-boundary cardinality mismatches.

2. **Gmail attachment processing**
   - Gmail `new-email` and Google Drive `upload-file` are already verified operations; retrieval and aggregation facts are detected.
   - The collection-pattern skeleton omits the detected retrieval node.
   - Stage D reports iterator-boundary cardinality mismatches.

3. **HR recruitment**
   - Asana task creation, Gmail invitation/reminder, and the two-day delay are detected.
   - The generic compiler title for a detected Delay does not express its deterministic wait boundary, causing `P4_DELAY_BOUNDARY_MISSING`.

4. **Social media scheduling**
   - The phrase “approved social posts” is interpreted by the existing pattern compiler as a human-approval collection, despite representing a business status.
   - That skeleton omits the explicit retrieval and logging actions.
   - Correcting it requires changing compiler pattern selection/topology.

5. **Appointment reminders**
   - All expected applications and canonical functions are detected.
   - “wait until two hours before it” also activates the generic loop signal, and the standalone Delay title fails its compiler boundary invariant.
   - Stage D reports iterator-boundary cardinality mismatches.

6. **Newsletter automation**
   - Retrieval, aggregation, Gmail sending, and both applications are detected.
   - The Aggregator is not preceded by the iterator-result edge required by the current compiler invariant.

7. **Outlook email processing**
   - Outlook, Drive, Sheets, collection cardinality, retrieval, iteration, and upload intent are detected.
   - The collection skeleton omits retrieval and logging nodes.
   - Stage D reports iterator-boundary cardinality mismatches.

## Boundary decision

The seven remaining failures cannot be corrected by adding verified application operations alone. Their application and function facts are already present; the failing conditions are compiler topology/invariant behavior and Stage D iterator cardinality validation. Those components were explicitly out of scope, so no speculative capability entries or broad heuristics were added.

## Metrics

| Metric | Before | After |
| --- | ---: | ---: |
| Passed | 22/30 | 23/30 |
| Average score | 83/100 | 84/100 |
| Branch pass rate | 100% | 100% |
| Capability safety | 100% | 100% |
| Regressions | 0 | 0 |
