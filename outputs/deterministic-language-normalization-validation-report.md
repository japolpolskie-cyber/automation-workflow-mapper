# Deterministic Language Normalization Validation

## Completion

A versioned, deterministic business-language normalizer now runs before existing scope intelligence. It preserves the original scope and emits evidence spans, rule IDs, explanations, canonical concepts, and explicit route names. Planner, compiler structure, Stage C topology rules, capabilities, persistence, database, and UI were not changed.

## Canonical concepts

- human approval: sign-off, authorize, green-light, and explicit role approval requests;
- rejection: decline, turn down, deny, and not approved;
- notification: alert, inform, and heads-up without selecting a provider;
- collection cardinality: entity-scoped each/every/all expressions while excluding schedules;
- aggregation: explicit combine, summarize, consolidate, and roll-up result phrases;
- multi-route decision: explicit category, priority, channel, status, severity, region, language, department, or type routing with at least three named routes;
- delay: explicit wait, later follow-up, period, or duration language;
- binary condition: explicit two-outcome expressions and paired domain states;
- validation: explicit screening, inspection, assessment, verification, and data checks.

Standalone rejection evidence does not create topology. Collection normalization adds scoped cardinality but does not inject a generic iterator or aggregator. Multi-route compilation requires at least three extracted route names. No platform application or operation is inferred by the normalizer.

## Original 30-scenario benchmark

| Metric | Result |
| --- | ---: |
| Passed | 30/30 (100%) |
| Average score | 91/100 |
| Branch pass rate | 100% |
| Capability safety | 100% |
| Regressions | 0 |

## Untouched novel 50-scenario benchmark

| Metric | Baseline | After normalization | Change |
| --- | ---: | ---: | ---: |
| Passed | 14/50 (28%) | 18/50 (36%) | +4 scenarios, +8 percentage points, +28.6% relative |
| Average score | 75/100 | 80/100 | +5 |
| Branch pass rate | 62% | 78% | +16 percentage points |
| Capability safety | 100% | 100% | unchanged |

Newly passing:

- Construction change-order approval
- Energy outage dispatch
- Waste pickup exception
- Language school placement

No previously passing novel scenario regressed.

## False-positive review

Unexpected functions among the remaining failed scenarios were: Action 13, Aggregator 11, Merge 8, Manual Review 6, Iterator 3, Binary Condition 2, and Logging 2. The baseline counts were Action 15, Aggregator 10, Merge 6, Manual Review 6, Iterator 3, and Binary Condition 2.

The normalizer itself does not emit Action, Merge, or Manual Review. The additional Merge and Logging nodes are existing deterministic router topology activated by newly recognized explicit route evidence. The single additional Aggregator remains an existing collection-skeleton behavior, not a normalization rule. Notification normalization produced no unexpected notification in the remaining failures.

## Verification

- Focused normalization and scope-intelligence tests: 39 passed.
- Full workspace tests: 284 passed, 4 live-only tests skipped.
- Lint: passed.
- Type-check: passed.
- Production build: passed (existing client bundle-size advisory remains).
- Original benchmark: 30/30 passed.
- Novel benchmark: 18/50 passed.
- Capability safety: 100% in both benchmark suites.
