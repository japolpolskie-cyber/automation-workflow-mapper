# K4.1 Planner Representation Report

## Outcome

K4.1 replaces the shadow planner's ordered step list with an explicit, grounded execution graph. Production workflow generation, persistence, validation, and rendering remain unchanged. K5 was not started.

## Graph representation

Planner nodes now declare:

- canonical function
- application and operation references
- inputs and outputs
- facts used
- patterns used
- knowledge used
- capabilities used
- blocking clarification IDs
- acknowledged limitations

Planner edges now declare:

- source and target
- condition and label
- purpose
- business reason
- rule ID
- evidence IDs

The plan also has first-class declarations for:

- binary TRUE/FALSE edges
- router labels, conditions, destinations, and edge references
- merge incoming branches, strategy, and continuation
- business-loop entry, body, exit, and termination
- retry target, maximum attempts, delay, termination, and failure edge
- plan-level clarification blockers

## Semantic validation

Shadow plans are rejected for:

- missing or duplicate graph IDs
- dangling or unreachable nodes
- unknown facts, patterns, knowledge, capabilities, evidence, or clarifications
- ungrounded nodes
- invalid application or operation references
- operation/function or operation/application mismatches
- unacknowledged limitations
- missing or mislabeled TRUE/FALSE edges
- invalid router destinations
- invalid merge inputs or continuation
- missing or invalid loop boundaries
- missing or invalid retry boundaries
- using one node as both a business loop and retry
- dropped required clarifications

## Files created

- `apps/server/src/planner/planner-graph-validator.ts`
- `apps/server/src/planner/planner-graph-validator.test.ts`
- `apps/server/src/planner/k4-1-acceptance.test.ts`
- `outputs/k4-1-planner-representation-report.md`

## Files modified

- `packages/shared/src/planner.ts`
- `apps/server/src/planner/planner-prompt-builder.ts`
- `apps/server/src/planner/planner-shadow-service.ts`
- `apps/server/src/planner/planner-shadow-service.test.ts`
- `apps/server/src/planner/k4-shadow-benchmark.test.ts`
- `apps/server/src/services/analysis-service.test.ts`

## Acceptance results

- 20 realistic K4.1 planner-context scenarios passed.
- Explicit binary, router, merge, loop, retry, grounding, reachability, and clarification tests passed.
- Server: 105 tests passed.
- Shared: 25 tests passed.
- Knowledge: 8 tests passed.
- Platforms: 8 tests passed.
- Client: 4 tests passed.
- Total: 150 tests passed.
- Full workspace typecheck passed.
- Production client build passed.

## Live Qwen result

The final Asana CRM K4.1 live shadow attempt did not produce an accepted graph:

- status: failed safely
- provider error: `fetch failed`
- prompt size: 21,114 characters
- retrieved knowledge: 11,738 characters
- elapsed planning time: 303.6 seconds
- persisted or promoted output: none

This is a material regression in local-model feasibility compared with K4's smaller representation. The representation and deterministic validators are complete, but local Qwen 3 8B did not reliably generate the richer graph under this benchmark.

## Backward compatibility and rollback

- Existing production prompt unchanged.
- Existing production provider input unchanged.
- Existing canonical workflow unchanged.
- Database and stored workflow schemas unchanged.
- K4.1 remains response-only shadow metadata.
- Disable all K4/K4.1 shadow work with `K4_PLANNER_SHADOW=false`.
- K3 analysis can remain enabled independently.

## Known limitations

- The graph schema substantially increases prompt size and local generation latency.
- Live Qwen acceptance must be improved before promotion is reconsidered.
- Current comparison metrics count nodes and edges but do not yet implement the full scoring rubric from the K4 acceptance review.
- The pre-existing client bundle-size warning remains (approximately 1.02 MB before gzip).

## Recommendation

Keep K4.1 shadow-only. The explicit graph representation is suitable for continued evaluation, but the current local Qwen configuration is not reliable enough to promote.

## Recommended commit

`feat(analysis): add explicit K4.1 planner execution graphs`

K5 was not started.
