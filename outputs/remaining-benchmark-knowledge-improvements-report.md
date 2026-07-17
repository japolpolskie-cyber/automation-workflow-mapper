# Remaining Benchmark Knowledge Improvements

## Scope

This sprint analyzed only the eleven scenarios that remained below the acceptance threshold after Priority 3. No persistence, database, compiler, SDK foundation, or UI code changed.

## Isolated deterministic knowledge gaps fixed

- **Google Calendar** was absent from the complete application registry, so exact references in Event Registration and Google Calendar Scheduling were not emitted as application facts.
- **Trello** was absent from the complete application registry, so the Trello Card Management scope could not satisfy application coverage despite otherwise complete function recognition.

Both applications now have stable IDs, exact names, categories, icons, and conservative operation lists based on operations already expected by the benchmark. No platform capability equivalence was invented.

## Benchmark comparison

| Metric | Before | After |
| --- | ---: | ---: |
| Passed | 19/30 | 22/30 |
| Failed | 11/30 | 8/30 |
| Average score | 83/100 | 83/100 |
| Capability safety | 100% | 100% |

Newly passing:

1. Event registration
2. Trello card management
3. Google Calendar scheduling

Regressions: none.

## Remaining failures

1. Inventory alerts
2. Gmail attachment processing
3. HR recruitment
4. Social media scheduling
5. Appointment reminders
6. Newsletter automation
7. Airtable synchronization
8. Outlook email processing

The remaining gaps are not missing exact application knowledge:

- Collection-pattern skeletons currently omit some explicitly detected retrieval, notification, or logging functions.
- Standalone delay and aggregation facts can produce compiler invariant failures because their deterministic boundary topology is incomplete.
- The create-or-update Airtable scenario produces a downstream structural/semantic validation failure despite complete function and application recognition.

Those behaviors are compiler-owned and were intentionally not changed because this sprint explicitly prohibited compiler modification. Adding broader recognition heuristics would not correct the compiled topology and could reduce precision.

## Safety and compatibility

- Existing application entries and aliases remain unchanged.
- All nineteen previously passing scenarios remain passing.
- Invalid capability references remain zero.
- Capability safety remains 100%.
