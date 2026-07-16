# K4.2 Local Planner Reliability Report

## Decision

K4.2 runtime safeguards and prompt compaction are implemented, but the live reliability acceptance gate is **not met**. K4 remains shadow-only. K5 was not started.

The K4.1 execution-graph contract remains unchanged. A compact model wire format is deterministically expanded and then parsed and validated against the complete K4.1 schema.

## Bottleneck analysis

The original K4.1 Asana CRM live run used 21,114 prompt characters and failed after approximately 303.6 seconds. The dominant bottleneck was local Qwen generation. Parsing and deterministic validation were not reached.

The first K4.2 live attempt also revealed that aborting the HTTP fetch did not reliably settle the local Ollama request on Windows. K4.2 now enforces a service-level deadline race in addition to forwarding an abort signal. This guarantees that shadow planning returns at the configured boundary even when the provider does not cooperate.

## Prompt compaction strategy

- Knowledge is sent by stable ID with a compact rule, required inputs, outputs, limitations, and alternatives.
- Capabilities include only detected applications, selected operations, required canonical functions, limitations, and alternatives.
- Facts include IDs, types, values, entity scope, and evidence references.
- Evidence includes only stable ID, rule ID, source offsets, and a missing-information marker.
- Patterns include sequence constraints, required signals, and stop/clarification requirements.
- Confidence, coverage, reliability, evidence weights, and QA metrics remain excluded.
- The model receives a concise wire schema. Software expands that wire representation into the unchanged K4.1 graph and validates it deterministically.
- The output schema is no longer duplicated inside the user message.

## Prompt-section measurements

Final compact prompts for the six live scenarios:

| Scenario | Characters | Estimated tokens |
|---|---:|---:|
| Asana CRM | 17,438 | 4,360 |
| Gmail attachment intake | 13,502 | 3,376 |
| Shopify fulfillment limitation | 9,843 | 2,461 |
| Follow up until response | 12,394 | 3,099 |
| Approved collection iterator | 15,461 | 3,866 |
| Service multi-route | 17,016 | 4,254 |
| **Average** | **14,276** | **3,569** |

Asana CRM decreased from 21,114 to 17,438 characters, a 17.4% reduction. Its largest remaining sections are the 5,180-character strict transport schema, 4,354-character retrieved knowledge context, 2,361-character evidence references, and 2,230-character planning facts.

## Staged-planning decision

The implementation first evaluated a compact single call because it avoids cross-stage inconsistency and all six prompts fit below the configured 24,000-character context budget.

The live result disproved the reliability assumption. A compact single call is not reliable enough on the current Qwen 3 8B environment. Staged planning was not added speculatively after the failed benchmark because it requires its own graph-assembly acceptance cycle. The recommended next K4.2 revision is bounded skeleton, node-grounding, and edge-grounding stages with deterministic assembly.

## Runtime controls

- `K4_PLANNER_TIMEOUT_MS` — default 180,000
- `K4_PLANNER_MAX_OUTPUT_CHARS` — default 120,000
- `K4_PLANNER_MAX_RETRIES` — default 1, maximum 2
- `K4_PLANNER_CONTEXT_BUDGET` — default 24,000
- `K4_PLANNER_SHADOW` — existing complete rollback flag

The runtime enforces:

- service-level deadline even if provider cancellation is ignored
- caller cancellation
- provider abort propagation
- maximum response and model-output size
- retry only for invalid JSON, schema mismatch, incomplete graph, or validation failure
- no retry for timeout, cancellation, connection, unavailable-provider, oversized-context, or oversized-output failures
- no persistence or promotion of partial output

## Failure taxonomy

- connection failure
- Ollama unavailable
- timeout
- context too large
- output too large
- invalid JSON
- schema mismatch
- unsupported reference
- incomplete graph
- validation failure
- cancellation
- unknown provider error

Each shadow result includes the category, processing stage, cache status, compaction status, cancellation state, prompt section sizes, estimated tokens, output size, time to first byte when available, total latency, parse latency, validation latency, and retry count. Prompt content is not logged.

## Fallback behavior

- Production analysis always remains authoritative.
- Shadow failure returns structured diagnostics and cannot fail production analysis.
- Only JSON/schema/incomplete-graph/validation failures are eligible for a bounded retry.
- Timeout and provider failures return immediately at the service boundary.
- No fallback invents operations, discards business logic, or weakens clarification requirements.
- No partial plan is persisted or promoted.

## Cache strategy

Only deterministic planner context is cached in memory. The versioned key contains:

- SHA-256 scope hash
- knowledge catalog version
- detector version
- prompt version
- selected platform

Final Qwen output is never cached. Materially different requests cannot share a context entry.

## Live Qwen benchmark

Environment:

- Ollama reachable locally
- model: `qwen3:8b`
- quantization: Q4_K_M
- six required real-world scenarios
- 30-second per-scenario evaluation bound

Results:

- successful complete graphs: 0/6 (0%)
- timeout rate: 6/6 (100%)
- average latency: approximately 30.0 seconds
- median latency: approximately 30.0 seconds
- p95 latency: approximately 30.0 seconds
- average prompt size: 14,276 characters
- average completed output size: not available; no call completed
- invalid references: not evaluable; no graph completed
- incomplete graphs: zero accepted; partial provider output was not returned
- validation failures: not evaluable; validation was not reached
- cancellations: 0
- retry frequency: 0; timeout is deliberately non-retryable

The earlier original K4.1 Asana run also failed, after approximately 303.6 seconds. Paired original K4.1 metrics do not exist for the other five scenarios and are not fabricated.

## Acceptance status

Passed:

- K4.1 graph contract unchanged
- production generation unchanged
- shadow failure cannot interrupt production
- zero partial output persisted
- prompt size reduced and within budget
- timeout and cancellation verified
- deterministic context caching verified
- existing K1–K4.1 regression suite passed

Failed:

- at least 90% live reliability on local Qwen 3 8B

Unsupported-reference and completed-graph validation targets cannot be evaluated because no live call completed.

## Tests and build

- Shared: 25 tests passed
- Knowledge: 8 tests passed
- Platforms: 8 tests passed
- Server: 123 tests passed; live benchmark skipped in the default suite
- Client: 4 tests passed
- Total default regression tests: 168 passed
- Separate six-scenario live benchmark harness: passed operationally and reported six bounded timeouts
- Full workspace typecheck: passed
- Server and package builds: passed
- Client production build: passed
- Existing client bundle-size warning remains at approximately 1.02 MB before gzip

## Files created

- `apps/server/src/planner/planner-runtime.ts`
- `apps/server/src/planner/planner-wire-format.ts`
- `apps/server/src/planner/planner-wire-format.test.ts`
- `apps/server/src/planner/k4-2-runtime.test.ts`
- `apps/server/src/planner/k4-2-live-benchmark.test.ts`
- `apps/server/src/planner/k4-2-prompt-benchmark.test.ts`
- `outputs/k4-2-local-planner-reliability-report.md`

## Files modified

- `.env.example`
- `packages/shared/src/planner.ts`
- `apps/server/src/ai/providers/analysis-provider.ts`
- `apps/server/src/ai/providers/ollama-provider.ts`
- `apps/server/src/ai/providers/openai-provider.ts`
- `apps/server/src/config/environment.ts`
- `apps/server/src/config/environment.test.ts`
- `apps/server/src/app.ts`
- `apps/server/src/app.test.ts`
- `apps/server/src/planner/planner-prompt-builder.ts`
- `apps/server/src/planner/planner-shadow-service.ts`
- `apps/server/src/planner/planner-context-builder.test.ts`

## Regression and rollback

- No production prompt changed.
- No production workflow generation changed.
- No canonical workflow, database, or persisted workflow schema changed.
- `planGrounded` remains backward compatible; detailed timing is exposed through an additive optional provider method.
- Disable all K4/K4.1/K4.2 evaluation with `K4_PLANNER_SHADOW=false`.
- K3 analysis remains independently controllable.

## Recommendation

Keep K4 evaluation-only. Do not promote it and do not begin K5.

The safest next action is a K4.2 revision implementing smaller bounded stages, beginning with skeleton-only planning and measuring whether Qwen 3 8B can reliably complete that stage. Alternatives are a longer bounded timeout, a different local model, or an optional remote planner.

## Recommended commit

`feat(analysis): add bounded compact K4.2 local planner runtime`
