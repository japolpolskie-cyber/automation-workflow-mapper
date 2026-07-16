# Stage D — Deterministic and Capability-Aware Edge Grounding

## Recommendation

**READY FOR K5**

Stage D grounds the semantics of existing P4 edges without changing P4 topology or Stage C node contracts. It remains shadow-only, disabled by default, non-persistent, and independently removable.

## Architecture summary

```text
K3.1 facts, evidence, patterns, clarifications
                         |
P4 immutable topology ---+--- Stage C immutable node contracts
                         |
                         v
              Stage D feature flag (off)
                         |
             bounded per-edge input
                         |
             deterministic rules first
                         |
          optional bounded selector (unused)
                         |
                         v
          separate non-persistent edge report
```

P4 owns nodes, edges, branches, loops, merges, iterators, and retries. Stage C owns application-operation grounding. Stage D owns only edge meaning. Topology and Stage C hashes are captured before and after every run.

## Grounded-edge contract

Contract version: `1.0.0`.

Every grounded edge contains:

- original edge, source-node, and target-node IDs
- stable edge type
- source and target handles
- meaningful display label
- condition summary
- business reason
- semantic data contract
- input/output cardinality relationship
- fact, evidence, pattern, clarification, and capability-limitation references
- deterministic, bounded-model, or unresolved grounding method
- provenance and validation status

The strict contract excludes confidence, coverage, reliability, evidence weights, QA scores, credentials, expressions, API payloads, and exact field mappings.

## Deterministic edge rules

- Binary conditions produce distinct `true` and `false` handles and meaningful Yes/No labels derived from the decision.
- Routers preserve evidence-grounded route names and explicitly identify fallback routes.
- Collection-to-Iterator transitions become collection inputs.
- Iterator `ITEM` transitions pass only the current item; `DONE` transitions represent collection completion.
- Loop entry, loop-back, and exit transitions remain separate.
- Merge inputs represent branch convergence; Aggregator inputs represent repeated item results.
- Retry failure, retry attempt, and retry exhaustion remain distinct from business loops.
- Delay transitions continue only after the bounded wait.
- Generic `NEXT` labels are replaced with source-to-target business meanings.
- Missing business meaning remains unresolved or clarification-bound.

## Condition and route semantics

The benchmark verifies:

- `Did the lead respond?` produces distinct Yes and No edges.
- The No edge retains the missing follow-up-interval clarification.
- Service routing preserves `Solar`, `HVAC`, `Security`, and `Unknown — Manual Review`.
- All router labels and destinations are unique.
- Route labels remain business text and are not treated as catalog IDs.

## Data flow and cardinality

Semantic data flow is derived from the Stage C source outputs and topology role:

- Google Drive folder creation passes folder ID and URL.
- Iterator item edges pass only the current record or file.
- Aggregator input receives repeated item results.
- Merge receives distinct branch results.

Validation rejects collection-to-single transitions without an Iterator, single-item Iterator input, Aggregator/Merge role confusion, invalid loop boundaries, and invalid retry targets.

## Model-selection boundary

The optional `StageDModelSelector` may select only:

- a numeric symbol from the controlled edge-type vocabulary
- a bounded condition summary
- bounded semantic data-flow categories

Software retains edge IDs, endpoints, handles, topology role, and stable references. Unknown or disallowed symbols fail deterministically and may receive only the configured bounded corrective retry.

No model selector is connected in this milestone. All benchmark grounding is deterministic, and no live AI stage was executed.

## Parallelism, retry, and caching

Stage D reuses the P2 distributed orchestrator. Every edge is an independent stage with bounded concurrency, timeout, and selective retry. One failed edge becomes explicitly unresolved without restarting Stage A, P4, Stage C, or successful sibling edges. Clarification-bound results do not retry.

The cache key includes:

- edge topology hash
- source and target Stage C grounding hashes
- relevant fact and evidence hashes
- pattern version
- platform
- capability/catalog version
- symbol-table snapshot hash
- Stage D contract version
- optional model identity

The cache test confirms two of two edge results are reused on an identical second run.

## Feature flags

| Variable | Default |
|---|---:|
| `STAGE_D_EDGE_GROUNDING` | `false` |
| `STAGE_D_MAX_CONCURRENCY` | `4` |
| `STAGE_D_EDGE_TIMEOUT_MS` | `120000` |
| `STAGE_D_MAX_RETRIES` | `1` |
| `STAGE_D_CACHE_ENABLED` | `true` |
| `STAGE_D_MAX_OUTPUT_CHARS` | `30000` |

When disabled, no Stage D object is created and no Stage D work runs. Stage C and P4 remain independently testable.

## Exact files created

- `packages/shared/src/stage-d-grounding.ts`
- `apps/server/src/planner/stage-d-edge-grounder.ts`
- `apps/server/src/planner/stage-d-grounding-service.ts`
- `apps/server/src/planner/stage-d-grounding.test.ts`
- `apps/server/src/planner/stage-d-benchmark.test.ts`
- `outputs/stage-d-deterministic-edge-grounding-report.md`

## Exact files modified

- `packages/shared/src/index.ts`
- `apps/server/src/config/environment.ts`
- `apps/server/src/config/environment.test.ts`
- `apps/server/src/app.ts`
- `apps/server/src/app.test.ts`
- `apps/server/src/planner/p4-deterministic-planner-service.ts`
- `.env.example`

## Seven-scenario benchmark

The corpus covers:

1. Asana Ready to Start: folder ID/URL passed to subtask and description update.
2. No Response: Yes stops follow-up, No continues, and missing interval remains clarification-bound.
3. Approved collection: collection input, current item, and completion.
4. Service recommendation: three named routes plus explicit unknown fallback.
5. Gmail attachments: attachment collection, per-file processing, and upload-result aggregation.
6. Create or Update Record: found/not-found branches converge through Merge.
7. Retry versus business loop: technical retry and follow-up loop use distinct semantics.

Results:

| Metric | Result |
|---|---:|
| Total edges | 26 |
| Deterministically grounded | 26 |
| Model grounded | 0 |
| Explicitly unresolved | 0 |
| Safe grounded-or-unresolved coverage | 100% |
| Invalid references | 0 |
| Generic labels | 0 |
| Branch-label correctness | 100% |
| Route completeness | 100% |
| Loop-boundary correctness | 100% |
| Merge-input correctness | 100% |
| Cardinality-transition correctness | 100% |
| Clarification preservation | 100% |
| Topology mutations | 0 |
| Stage C mutations | 0 |
| Retries | 0 |
| Model calls | 0 |
| Deterministic latency | approximately 0.13–0.38 ms per grounded edge in test runs |

## Regression results

- Shared: 30 tests passed.
- Knowledge: 8 tests passed.
- Platforms: 8 tests passed.
- Server: 190 tests passed; 4 live-AI tests intentionally skipped.
- Client: 4 tests passed.
- Total: **240 tests passed; 4 intentionally skipped**.
- Stage D focused suite: 4 tests passed.
- Lint: passed.
- Type-check: passed across all workspaces.
- Production build: passed across all workspaces.
- Existing advisory: the client main bundle exceeds Vite's 500 kB warning threshold. Stage D adds no client code.

Windows sandbox restrictions initially prevented Vite from reading its configuration during the combined client test/build commands. The same client tests and production build passed when rerun with the required read access.

## Backward compatibility and persistence

- Stage D is disabled by default.
- P4 and Stage C behavior is unchanged when disabled.
- The P4 result adds only the nullable `edgeGrounding` report.
- No database schema or migration changed.
- No Stage D output is persisted.
- No Qwen prompt changed.
- No production workflow-generation behavior changed.
- No experimental planner was promoted.
- No live AI stage was executed.
- K5 has not started.

## Rollback

Operational rollback: set or leave `STAGE_D_EDGE_GROUNDING=false`.

Code rollback: remove the optional Stage D service injection and nullable `edgeGrounding` result, remove the Stage D files/shared export, and remove the Stage D environment fields. No database or persisted-data rollback is necessary.

## Known limitations

- The deterministic data contract remains semantic; it intentionally does not create production field mappings.
- The optional model selector is a tested boundary but is not connected to Qwen.
- Edge rules depend on P4 topology metadata being internally consistent. Inconsistent topology is reported rather than repaired.
- Follow-up timing, attempt limits, fallback owners, and similar missing business rules remain clarification dependencies.
- The output-size setting is reserved for a future optional model selector and is inactive in deterministic-only runs.
- New P4 topology roles must add a Stage D controlled-vocabulary rule and collision tests.

## Recommended commit message

`feat(analysis): add Stage D deterministic edge grounding`

