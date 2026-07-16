# P3.7 — Semantic Role Constraints and Topology Completion

## Final recommendation

**USE MORE DETERMINISTIC SKELETON CONSTRUCTION**

P3.7 is complete as a safe enforcement boundary, but the local Qwen3 8B model did not meet the live promotion gates. Keep the distributed planner shadow-only and disabled by default. Do not weaken semantic validation.

## Semantic-role architecture summary

P3.7 preserves the P3.6 controlled vocabulary and adds a deterministic semantic layer around Stage B:

1. K3.1 facts, entity cardinality, patterns, decisions, route counts, repetition, and clarifications are converted into semantic role slots before model execution.
2. Each role slot contains only role-compatible canonical-function symbols.
3. The provider output schema emits role-slot-specific alternatives.
4. Stage B must reference a software-assigned slot, role, input shape, output shape, and canonical symbol.
5. Software validates semantic role, cardinality, edge role, neighboring topology, special boundaries, and clarification relevance.
6. Invalid output is rejected. Stage B receives at most one corrective retry containing the exact deterministic issue codes and explanations.
7. Missing business meaning remains a clarification. P3.7 performs no general AI repair and no silent role substitution.
8. Successful output would still resolve into the unchanged K4.1 execution graph contract.

No experimental output is persisted.

## Role definitions

The role registry defines:

- `workflow-trigger`
- `data-retrieval`
- `data-transformation`
- `validation-gate`
- `binary-decision`
- `multi-route-decision`
- `collection-iterator`
- `business-loop`
- `technical-retry`
- `branch-merge`
- `item-aggregator`
- `delay-boundary`
- `notification`
- `logging`
- `manual-review`
- `successful-end`
- `blocked-end`
- `escalation-end`

Each definition declares allowed canonical functions, accepted input and output shapes, minimum incoming edges, expected outgoing topology, allowed edge roles, forbidden neighboring roles, related clarification categories, compatible patterns, cardinality, and termination permission.

Supported data shapes are `none`, `single`, `collection`, `branches`, `item-results`, and `unknown`.

Supported edge roles are `flow`, `true`, `false`, `route`, `fallback`, `loop-entry`, `loop-back`, `loop-exit`, `retry`, `retry-exhausted`, `merge-input`, and `continuation`.

## Role-constrained symbol-table design

The authoritative P3.6 symbol table is unchanged. P3.7 adds per-run role slots:

```text
role slot
├── deterministic role
├── allowed canonical-function symbols
├── required input shape
├── produced output shape
├── supporting fact symbols
├── related clarification symbols
├── compatible pattern symbols
└── deterministic assignment reason
```

Stage B no longer receives only an unrestricted interpretation of the canonical-function namespace. Its JSON Schema contains a role-slot alternative for every software-approved slot. Each alternative binds:

- role-slot index;
- semantic role;
- allowed canonical symbols;
- input shape;
- output shape.

The runtime validator independently enforces the same relationship. Provider schema behavior therefore cannot bypass the application boundary.

## Deterministic role assignment

Assignment uses:

- K3.1 workflow-function and decision facts;
- entity-scoped `single` versus `collection` facts;
- matched workflow patterns;
- follow-up repetition;
- binary versus multi-route decisions;
- create-or-update and service-routing patterns;
- retrieved allowed canonical functions;
- open clarification categories.

The model may choose among compatible alternatives but cannot cause an incompatible selection to be accepted.

## Topology-completion rules

### Binary condition

- role must be `binary-decision`;
- canonical function must be `binary-condition`;
- explicit `TRUE` and `FALSE` edges;
- distinct business destinations.

### Router

- role must be `multi-route-decision`;
- at least three meaningful routes;
- labeled conditions and destinations;
- no duplicate destinations.

### Loop

- explicit entry, body, loop-back, and exit;
- stop boundary or blocking clarification;
- cannot be represented as technical retry.

### Retry

- role must be `technical-retry`;
- failed technical operation reference;
- retry and exhausted routes;
- attempt limit or explicit missing-limit clarification;
- cannot represent business repetition.

### Merge

- role must be `branch-merge`;
- at least two distinct incoming business branches;
- continuation edge.

### Aggregator

- role must be `item-aggregator`;
- item-results input;
- item source;
- aggregation method placeholder;
- continuation;
- cannot substitute for branch convergence.

### Other invariants

- iterator requires collection input;
- delay requires duration, date, event, or related clarification;
- trigger has no incoming workflow edges;
- terminal roles have no outgoing business edges;
- special semantic roles require their matching topology declaration;
- related clarifications cannot be attached to unrelated roles.

## Validation issue catalog

P3.7 returns precise deterministic codes:

- `UNKNOWN_ROLE_SLOT`
- `ROLE_SLOT_MISMATCH`
- `CANONICAL_FUNCTION_ROLE_MISMATCH`
- `ROLE_INPUT_SHAPE_MISMATCH`
- `ROLE_OUTPUT_SHAPE_MISMATCH`
- `CLARIFICATION_ROLE_MISMATCH`
- `INSUFFICIENT_INCOMING_EDGES`
- `TRIGGER_HAS_INCOMING_EDGE`
- `END_HAS_OUTGOING_EDGE`
- `EDGE_ROLE_NOT_ALLOWED`
- `ITERATOR_REQUIRES_COLLECTION`
- `DELAY_BOUNDARY_MISSING`
- `BUSINESS_LOOP_AS_RETRY`
- `RETRY_AS_BUSINESS_LOOP`
- `BINARY_ROLE_MISMATCH`
- `BINARY_BRANCH_INCOMPLETE`
- `DUPLICATE_BINARY_DESTINATION`
- `ROUTER_ROLE_MISMATCH`
- `ROUTER_REQUIRES_MULTIPLE_ROUTES`
- `DUPLICATE_ROUTE_DESTINATION`
- `MERGE_ROLE_MISMATCH`
- `MERGE_REQUIRES_DISTINCT_BRANCHES`
- `AGGREGATOR_ROLE_MISMATCH`
- `AGGREGATION_METHOD_MISSING`
- `LOOP_TOPOLOGY_INCOMPLETE`
- `LOOP_STOP_BOUNDARY_MISSING`
- `RETRY_ROLE_MISMATCH`
- `RETRY_TOPOLOGY_INCOMPLETE`
- `RETRY_LIMIT_UNRESOLVED`
- `INCOMPLETE_ROLE_TOPOLOGY`

## Live benchmark results

Environment:

- Model: Qwen3 8B through local Ollama
- Mode: distributed shadow experiment
- Persistence: disabled
- Maximum corrective retries: one for Stage B
- Core scenarios: six
- Total duration: 1,101.92 seconds
- Mean end-to-end duration: approximately 183.65 seconds per scenario

| Metric | Result |
|---|---:|
| Stage A completion | 6/6 — 100% |
| Stage B semantically valid skeleton | 0/6 — 0% |
| Valid-reference rate for accepted Stage A artifacts | 100% |
| Unsupported references accepted | 0 |
| Semantic-role accuracy for accepted Stage B artifacts | No accepted artifacts |
| Topology-completeness rate | 0/6 |
| Branch-completeness rate | 0/6 accepted |
| Loop-boundary accuracy | No accepted loop skeleton |
| Merge/aggregator distinction | Enforced deterministically; no live skeleton accepted |
| Iterator/cardinality correctness | Enforced deterministically; no invalid skeleton accepted |
| Invented blocking-policy count | 0 |
| Supplied clarification preservation in accepted Stage A artifacts | 100% |
| Stage B retry count | 6 bounded retries |

The principal failure was not vocabulary drift. The constrained local model repeatedly emitted only the role-choice fields while omitting other required node fields such as title and reference arrays. The strict contract correctly rejected those outputs on both attempts.

The live success gates of at least 5/6 Stage A and 4/6 Stage B were therefore only half met:

- Stage A gate: passed.
- Stage B gate: failed.

## Targeted benchmark coverage

The live benchmark catalog now includes:

1. single lead versus multiple attachments;
2. filter versus visible false path;
3. IF versus three-route service decision;
4. merge versus aggregator;
5. follow-up loop versus technical retry;
6. Approved status versus human approval;
7. delay with explicit interval;
8. delay with missing interval;
9. create-or-update branch convergence;
10. multiple independent workflow previews.

These distinctions are covered by deterministic regular tests. Full targeted live execution is opt-in through `LIVE_P37_TARGETED=true` because Qwen3 8B required more than eighteen minutes for the six core scenarios.

## Files created

- `packages/shared/src/semantic-role.ts`
- `apps/server/src/planner/semantic-role-model.ts`
- `apps/server/src/distributed-planner/p3-semantic-validator.ts`
- `apps/server/src/distributed-planner/p3-semantic-validator.test.ts`
- `outputs/p3-7-semantic-role-and-topology-report.md`

## Files modified

- `packages/shared/src/index.ts`
- `packages/shared/src/p3-6-planner.ts`
- `apps/server/src/planner/controlled-vocabulary.ts`
- `apps/server/src/planner/controlled-vocabulary.test.ts`
- `apps/server/src/distributed-planner/controlled-output-schema.ts`
- `apps/server/src/distributed-planner/controlled-output-schema.test.ts`
- `apps/server/src/distributed-planner/distributed-planner-orchestrator.ts`
- `apps/server/src/distributed-planner/p3-ollama-stage-runner.ts`
- `apps/server/src/distributed-planner/p3-shadow-experiment.ts`
- `apps/server/src/distributed-planner/p3-shadow-experiment.test.ts`
- `apps/server/src/distributed-planner/p3-live-benchmark.test.ts`

## Regression results

| Suite | Result |
|---|---:|
| Shared | 30 passed |
| Knowledge | 8 passed |
| Platforms | 8 passed |
| Server | 165 passed; 3 live-only tests skipped in regular execution |
| Client | 4 passed |
| Total regular tests | **215 passed** |
| P3.7 live benchmark test | 1 passed as an observational shadow benchmark |
| Lint | Passed |
| Type check | Passed |
| Production build | Passed |

The production build retains the pre-existing client chunk-size warning. P3.7 adds no client code.

## Backward compatibility

- Production planner behavior is unchanged.
- Production remains the default runtime mode.
- Experimental planner behavior remains disabled by default.
- K4.1 execution graph contract is unchanged.
- No Qwen production-generation prompt changed.
- No database or persisted workflow schema changed.
- No experimental planner artifact is persisted.
- Controlled vocabulary stable IDs and numeric symbol behavior remain intact.
- Stage C, Stage D, P4, and K5 have not started.

## Rollback

Operational rollback requires no migration:

1. Leave `PLANNER_RUNTIME_MODE` unset or set it to `production`.
2. Keep all K4/P2/P3 experimental feature flags false.
3. Restart the server.

The application will use the unchanged production workflow generator. No stored data needs conversion or cleanup.

Code rollback can remove the P3.7 semantic-role files and restore the Stage B wire schema to P3.6 because no P3.7 artifact is persisted.

## Known limitations

1. Qwen3 8B does not reliably satisfy the larger role-constrained Stage B structured-output schema on the current hardware.
2. Schema correctness and semantic correctness are now enforced, but strict enforcement cannot make an under-capable model produce a complete artifact.
3. The current Stage B asks the model to repeat structural fields that software can generate deterministically.
4. Independent workflow boundaries are recognized in Stage A, but no Stage B result passed for multi-workflow topology.
5. Full targeted live execution is too slow for the regular test suite.
6. The role registry is intentionally closed for P3.7; future application operations must map into an existing semantic role rather than create ad hoc roles.

## Recommended next action

Construct the Stage B skeleton deterministically from:

- Stage A workflow boundaries;
- K3.1 decision and route facts;
- known patterns;
- entity-scoped cardinality;
- role slots;
- clarification blockers.

Let Qwen select only genuine business alternatives that deterministic evidence cannot decide. This hybrid approach keeps business interpretation with the model while moving node boilerplate, edges, loop boundaries, merges, and terminal topology into reproducible software.

Do not promote the current live Stage B planner and do not begin P4 until that user-approved direction is chosen.

## Approval boundary

P3.7 stops here. Stage C, Stage D, P4, and K5 have not begun.
