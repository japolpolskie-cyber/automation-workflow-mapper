# Priority 3 Multi-Route Detection and Operation Selection

## Scope

Priority 3 generalizes deterministic multi-route recognition and improves selection of application operations in sequential scopes. It does not change compiler structure, UI, persistence, database contracts, or SDK foundations.

## Deterministic routing

The existing scope-intelligence layer now recognizes:

- three-or-more named branches
- route and switch language
- status, category, priority, channel, department, service, and type routing
- explicitly named fallback/default routes
- separate or matching multi-destination paths

Named routes remain evidence-backed. Router topology continues to be produced by the unchanged deterministic compiler.

## Sequential action semantics

- External create, update, upload, fulfill, schedule, archive, move, mark, save, and send actions become clause-scoped action facts.
- Multiple action facts within one sentence preserve separate evidence locations.
- The existing operation selector evaluates clauses independently.
- Candidate operations are ranked deterministically by application ownership, action verb, entity terms, and retrieved catalog evidence.
- Only the highest-ranked operation candidates per application clause are retained.

## Benchmark comparison

| Metric | Priority 2 | Priority 3 | Change |
|---|---:|---:|---:|
| Scenarios | 30 | 30 | — |
| Passed | 17 | 19 | +2 |
| Failed | 13 | 11 | -2 |
| Strict pass rate | 56.7% | 63.3% | +6.6 points |
| Average score | 79/100 | 83/100 | +4 |
| Branch pass rate | 93.3% | 100% | +6.7 points |
| Capability safety | 100% | 100% | unchanged |

## Scenarios changed from FAIL to PASS

1. IT helpdesk ticket routing
2. Google Drive organization

## Regressions

None. All seventeen Priority 2 passing scenarios remain passing.

## Verification focus

- Existing service-based routing remains supported.
- Hardware/Software/Access routing is recognized.
- Contracts/Invoices/Other routing is recognized.
- Priority routing with a default destination is recognized.
- Sequential Asana, Google Drive, Gmail, and Google Sheets operations select their owning application operations.
- Unsupported operations remain explicit and capability safety remains 100%.
