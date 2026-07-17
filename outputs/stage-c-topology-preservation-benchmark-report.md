# Stage C Topology Preservation Benchmark

## Completion

The seven remaining benchmark scenarios now pass through the existing planner pipeline without persistence, database, UI, SDK, or pipeline-structure changes.

## Changes

- Collection retrieval is preserved before iterator entry.
- Per-item action, delay, notification, and logging steps remain inside iterator boundaries.
- Iterator feedback is represented as a control loop-back rather than a new collection input.
- Aggregators consume iterator completion and can emit one aggregated result to a downstream action.
- End nodes accept terminal results of any cardinality.
- Explicit workflow functions are compiled in evidence order, preserving sequential action semantics.
- “Approved” status values no longer create a human-approval collection topology without explicit approval-process evidence.
- Google Sheets `list-rows` provides a verified collection-producing retrieval operation; Zapier limitations remain explicit.

## Benchmark

| Metric | Baseline | Result |
| --- | ---: | ---: |
| Passed | 23/30 | 30/30 |
| Average score | 84/100 | 91/100 |
| Branch pass rate | 100% | 100% |
| Capability safety | 100% | 100% |
| Regressions | 0 | 0 |

Newly passing:

1. Inventory alerts
2. Gmail attachment processing
3. HR recruitment
4. Social media scheduling
5. Appointment reminders
6. Newsletter automation
7. Outlook email processing

Remaining failures: none.

## Safety

- No unsupported application operation was accepted.
- No invalid capability reference was introduced.
- Existing approval, router, binary-condition, loop, retry, and merge tests remain unchanged.
- The compiler contract and planner pipeline structure remain unchanged.
