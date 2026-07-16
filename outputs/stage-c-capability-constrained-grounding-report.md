# Stage C — Capability-Constrained Node Grounding

## Recommendation

**READY FOR STAGE D**

Stage C safely grounds P4 semantic nodes to versioned K2 catalog operations while preserving the P4 execution graph byte-for-byte. It remains shadow-only, disabled by default, non-persistent, and independently removable.

## Architecture summary

Stage C runs after a successful P4 deterministic skeleton compilation. It receives the immutable P4 plan and K3.1 planner context, constructs a bounded per-node candidate set from the K2 knowledge catalog, eliminates unsupported or cardinality-incompatible candidates, and performs deterministic-first matching. An optional model selector may choose only from bounded numeric symbols; no model selector is enabled in the current runtime.

The stage returns a separate grounding report. It does not add, remove, reorder, or reconnect P4 nodes and edges. A before/after topology hash is recorded and validated. Grounding reports are not written to workflow persistence.

## Compiler integration

```text
K3.1 facts + P4 execution graph
              |
              v
     Stage C feature flag (off by default)
              |
              v
   Per-node bounded candidate construction
              |
      +-------+--------+
      |                |
 deterministic      unresolved
 unique match       ambiguity/gap
      |
 optional bounded model selection (not configured)
              |
              v
 Separate non-persistent grounding report
```

## Files created

- `packages/shared/src/stage-c-grounding.ts`
- `apps/server/src/planner/stage-c-node-grounder.ts`
- `apps/server/src/planner/stage-c-grounding-service.ts`
- `apps/server/src/planner/stage-c-grounding.test.ts`
- `apps/server/src/planner/stage-c-benchmark.test.ts`
- `outputs/stage-c-capability-constrained-grounding-report.md`

## Files modified

- `packages/shared/src/index.ts`
- `apps/server/src/config/environment.ts`
- `apps/server/src/config/environment.test.ts`
- `apps/server/src/app.ts`
- `apps/server/src/app.test.ts`
- `apps/server/src/planner/p4-deterministic-planner-service.ts`
- `.env.example`

## Public contracts

Contract version: `1.0.0`.

- `StageCOperationCandidate`
- `StageCNodeGroundingInput`
- `GroundedNode`
- `StageCGroundingReport`

Every grounded result identifies its canonical function, semantic role, application and operation IDs, cardinality, capability and knowledge references, platform support, limitations, alternatives, provenance, blocking clarifications, and bounded symbols. Unresolved nodes carry an explicit reason and never masquerade as grounded operations.

The K4.1 execution-graph contract is unchanged.

## Grounding and validation rules

1. Candidate construction is restricted to the node's canonical function.
2. Unsupported platform mappings are excluded before selection.
3. Input and output cardinality are checked before semantic scoring.
4. Explicit application and operation language outranks broad contextual facts.
5. Named unsupported providers such as SMS and Shopify remain unresolved.
6. Internal topology roles such as Iterator, Router, Merge, Aggregator, and End remain explicit internal capabilities rather than fabricated application operations.
7. Optional model output is restricted to candidate-table numeric symbols. Unknown and cross-namespace symbols fail deterministically.
8. Capability, canonical-function, cardinality, reference, and topology validators run on the report.
9. Failure of one node does not prevent independent nodes from being evaluated.

## Concurrency, retries, and cache

Stage C reuses the P2 distributed orchestrator lifecycle. Each node is an independent stage with bounded concurrency, timeout, and selective retry. Failed nodes become explicitly unresolved; successful sibling results remain usable.

The versioned cache key contains:

- node purpose hash
- semantic role and canonical function
- fact and evidence hashes
- target platform
- knowledge-catalog version
- controlled-symbol snapshot
- Stage C contract version
- optional model ID

Catalog, contract, symbols, platform, meaning, facts, or evidence changes invalidate the cached result. Cache entries contain analysis metadata only.

## Environment variables

| Variable | Default | Purpose |
|---|---:|---|
| `STAGE_C_NODE_GROUNDING` | `false` | Master Stage C feature flag |
| `STAGE_C_MAX_CONCURRENCY` | `4` | Maximum concurrent node-grounding stages |
| `STAGE_C_NODE_TIMEOUT_MS` | `120000` | Per-node timeout |
| `STAGE_C_MAX_RETRIES` | `1` | Selective retry limit |
| `STAGE_C_CACHE_ENABLED` | `true` | Versioned per-node cache |
| `STAGE_C_MAX_OUTPUT_CHARS` | `30000` | Output boundary for a future optional selector |

## Six-scenario benchmark

| Scenario | Nodes | Deterministic | Explicitly unresolved | Result |
|---|---:|---:|---:|---|
| Asana Ready to Start | 8 | 6 | 2 | Correct Asana trigger/details/subtask and Drive search/create mappings |
| No Response | 6 | 4 | 2 | CRM, Gmail, and Asana grounded; uncatalogued SMS remains unresolved |
| Approved collection | 5 | 2 | 3 | Webhook and single-row Sheets operation grounded; iterator/aggregator/end remain internal |
| Service recommendation | 7 | 4 | 3 | Three Gmail sends grounded; router/merge/end remain internal |
| Gmail attachment intake | 6 | 3 | 3 | Gmail trigger/search and Drive upload grounded; iterator/aggregator/end remain internal |
| Shopify fulfillment | 3 | 0 | 3 | No Shopify operation fabricated |

Totals:

- 35 nodes evaluated
- 19 deterministically grounded
- 16 explicitly unresolved
- 0 invalid references
- 0 unsupported operations accepted
- 1 unsupported platform candidate rejected
- 0 canonical-role mismatches
- 0 cardinality mismatches
- 0 topology mutations
- 0 retries required
- 0 model-selected nodes
- approximately 0.27–0.32 ms average deterministic grounding latency per scenario run
- 100% of nodes safely classified as valid catalog grounding or explicit unresolved requirement

Exact-operation assertions cover Asana task movement/details/subtask operations, Drive folder search/create and upload, CRM lookup, Gmail send/search/trigger, Asana task update, and Sheets Add Row. Safety assertions cover SMS and Shopify limitations.

## Verification results

- Shared: 30 tests passed.
- Knowledge: 8 tests passed.
- Platforms: 8 tests passed.
- Server: 186 tests passed; 4 live-AI tests intentionally skipped.
- Client: 4 tests passed.
- Total: **236 tests passed; 4 intentionally skipped**.
- Stage C focused suite: 7 tests passed.
- Lint: passed.
- Type-check: passed for all workspaces.
- Production build: passed for all workspaces.
- Existing client build warning: the main bundle exceeds Vite's 500 kB advisory threshold. Stage C adds no client code.

The initial all-workspace test/build commands encountered Windows sandbox denial while Vite read its configuration. Re-running the client test and production build with the required read access passed.

## Backward compatibility and persistence

- Stage C is disabled by default.
- Existing P4 callers remain compatible because the service dependency is optional.
- With Stage C disabled, the P4 result contains `grounding: null`.
- No Qwen prompt changed.
- No production workflow-generation behavior changed.
- No workflow or grounding output was persisted.
- No database schema or migration changed.
- P4 topology and K4.1 contracts remain unchanged.
- Stage D and K5 have not started.
- No live AI grounding was executed.

## Rollback

Immediate operational rollback: keep `STAGE_C_NODE_GROUNDING=false` or remove the variable so the default applies.

Code rollback is isolated: remove the optional Stage C service injection and `grounding` result field, remove the Stage C files and shared export, then remove the Stage C environment settings. No data rollback or migration is required because Stage C persists nothing.

## Known limitations and risks

- The initial K2 catalog does not cover SMS, Shopify, Outlook, Facebook Lead Ads, or HubSpot operations. Stage C correctly exposes these gaps.
- Internal control nodes are intentionally unresolved at the application-operation layer; their topology is already owned by P4.
- Asana `Update Subtask` can remain ambiguous when the request lacks enough operation-specific language. This is safer than selecting `Update Task`.
- The optional model selector contract exists but is not connected to Qwen. Current Stage C behavior is therefore fully deterministic.
- Deterministic lexical matching should remain conservative. Catalog growth should be accompanied by collision tests because similar operation titles can produce ambiguity.
- The service output-character limit is reserved for the optional model boundary and has no effect while deterministic-only grounding is used.

## Recommended commit message

`feat(analysis): add Stage C capability-constrained node grounding`

