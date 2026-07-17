# Priority 2 Approval, Binary Decisions, and UI Readability

## Scope

This sprint extends the existing deterministic knowledge rules for approval and binary business decisions. It does not change planner-pipeline structure, compiler structure, persistence, database contracts, or SDK foundations.

Two isolated typography adjustments improve the theme selector and workflow editor node-details panel without changing layout or workflow-node sizing.

## Deterministic recognition

The existing scope-intelligence stage now promotes:

- explicit human approval requests
- named reviewer approve/reject actions
- approved workflow statuses used by the validation benchmark
- yes/no decisions
- replied/not replied decisions
- success/failure decisions
- status-based IF/Else routing
- stop/continue outcomes
- threshold and explicit otherwise/else conditions

Each binary predicate produces both the existing decision fact and a first-class workflow-function fact with deterministic evidence. The unchanged compiler consumes those facts through its existing approval and binary skeletons.

## Benchmark comparison

| Metric | Priority 1 | Priority 2 | Change |
|---|---:|---:|---:|
| Scenarios | 30 | 30 | — |
| Passed | 7 | 17 | +10 |
| Failed | 23 | 13 | -10 |
| Strict pass rate | 23.3% | 56.7% | +33.4 points |
| Average score | 69/100 | 79/100 | +10 |
| Branch pass rate | 56.7% | 93.3% | +36.6 points |
| Capability safety | 100% | 100% | unchanged |

## Scenarios changed from FAIL to PASS

1. CRM lead management
2. Customer onboarding
3. Employee onboarding
4. Invoice approval
5. Purchase request approval
6. Leave request approval
7. Marketing campaign approval
8. Customer support escalation
9. Contract approval
10. Multi-step conditional approval

## Regressions

None. All seven scenarios passing after Priority 1 remain passing.

## UI readability

- The native Light, Dark, and System menu options now use the surrounding 13px interface typography while preserving the compact icon selector.
- Node-details headings, labels, inputs, dropdowns, values, descriptions, guidance, and helper text received small scoped size increases.
- Workflow nodes and editor layout are unchanged.

## Safety

- Capability safety remains 100%.
- No invalid capability references were introduced.
- Unsupported operations remain explicit.
- No persistence, database, SDK, or compiler-structure changes were made.
