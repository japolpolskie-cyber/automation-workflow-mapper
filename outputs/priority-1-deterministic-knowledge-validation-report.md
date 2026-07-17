# Priority 1 Deterministic Knowledge Validation

## Scope

Priority 1 extends deterministic scope knowledge only. It adds first-class, evidence-backed recognition for:

- data retrieval and search
- notifications and alerts
- logging and audit records
- validation and verification
- delay and wait boundaries

The existing planner pipeline, deterministic compiler, Stage C, Stage D, prompts, persistence, database, SDK, and UI are unchanged.

## Implementation

The existing versioned workflow-function rule table now recognizes common platform-oriented operation language while remaining clause-scoped and bounded.

Detected functions are added to the existing canonical-function retrieval map so the current knowledge catalog and platform capability references are selected without introducing a new representation.

The evidence contract remains at rule version 1.1.0 for backward compatibility.

## Benchmark comparison

| Metric | Previous | Priority 1 | Change |
|---|---:|---:|---:|
| Scenarios | 30 | 30 | — |
| Passed | 2 | 7 | +5 |
| Failed | 28 | 23 | -5 |
| Strict pass rate | 6.7% | 23.3% | +16.6 points |
| Average score | 68/100 | 69/100 | +1 |
| Branch pass rate | 56.7% | 56.7% | unchanged |
| Capability safety | 100% | 100% | unchanged |

## Scenarios changed from FAIL to PASS

1. Shopify order fulfillment
2. Slack notifications
3. Stripe payment notifications
4. Asana project creation
5. ClickUp task automation

The previously passing Sales quote follow-up and HubSpot lead nurturing scenarios remain passing.

## Verification

- Focused scope-intelligence tests: 24 passed
- 30-scenario validation benchmark: passed
- No unsafe capability references were introduced
- No branching behavior changed
- No planner-pipeline or compiler changes were made

## Remaining boundary

The remaining failures are primarily approval, binary-condition, multi-route, action-selection, and missing application-pack concerns. They are outside Priority 1 and were not modified.
