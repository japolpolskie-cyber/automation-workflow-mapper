# P3 Live Stage A/B Experiment Delivery Report

## Decision

**Revise P3 and retain it as shadow-only.**

The typed experiment and its safety boundaries work, but the live Qwen 3 8B
reliability gates were not met:

- Stage A: 3/6 successful (required: 5/6)
- Stage B: 1/6 successful (required: 4/6)
- Fully completed Stage A+B scenarios: 1/6

Contracts were not weakened to force a pass. P4, Stage C, Stage D, and K5 have
not started.

## Architecture summary

P3 adds two disabled-by-default, non-persisted shadow stages on top of the P2
deterministic orchestrator:

1. Stage A interprets business intent into a strict, versioned artifact.
2. Stage B consumes only validated Stage A output plus compact deterministic
   planning context and produces a canonical workflow skeleton.

The stages communicate only through parsed contracts. Deterministic validators
reject invalid references, missing topology, observability leakage, operation
grounding, and silent clarification loss. Failures are returned as experiment
results and cannot alter production analysis.

## Exact files created

- `packages/shared/src/p3-planner.ts`
- `apps/server/src/distributed-planner/p3-stage-validator.ts`
- `apps/server/src/distributed-planner/p3-ollama-stage-runner.ts`
- `apps/server/src/distributed-planner/p3-shadow-experiment.ts`
- `apps/server/src/distributed-planner/p3-shadow-experiment.test.ts`
- `apps/server/src/distributed-planner/p3-live-benchmark.test.ts`
- `outputs/p3-live-stage-ab-experiment-report.md`

## Exact files modified

- `packages/shared/src/index.ts`
- `apps/server/src/config/environment.ts`
- `apps/server/src/config/environment.test.ts`
- `apps/server/src/app.test.ts`
- `.env.example`

## Stage A contract

Input contains:

- raw scope
- compact deterministic facts
- evidence references
- blocking clarifications
- relevant pattern identifiers and constraints

Output contains:

- business objective
- actors and systems
- source and destination systems
- business entities and outcomes
- constraints and explicit business rules
- unresolved questions
- decomposition hints
- fact and knowledge references
- workflow-boundary candidates

Stage A cannot contain workflow nodes, edges, selected operations, or
observability metrics.

## Stage B contract

Input contains:

- validated Stage A artifact
- compact facts and evidence references
- blocking clarifications
- allowed canonical functions
- compact topology and pattern constraints
- selected knowledge/capability references

Output contains:

- one or more non-persisted workflow previews
- boundary-linked workflow IDs and titles
- canonical node placeholders
- skeleton edges
- explicit binary true/false topology
- router routes
- loop entry/body/exit/termination boundaries
- merge placeholders
- blocking clarification references
- unresolved grounding requirements
- fact, evidence, and knowledge references

It does not contain platform operations, field mappings, final K4.1 nodes, or
persisted workflow sets.

Both contracts are strict and use P3 contract version `3.0.0`.

## Prompt composition

Stage A uses the raw scope, compact facts, clarifications, and pattern
constraints. Stage B uses validated intent, compact canonical definitions,
topology rules, clarifications, and allowed constraints. Neither prompt
contains full manuals, complete operation packs, platform catalogs, K4.1 final
graph schema, confidence, coverage, reliability, evidence weights, benchmark
scores, or QA metrics.

No existing Qwen production prompt was changed.

## Runtime controls

| Variable | Default |
|---|---:|
| `P3_DISTRIBUTED_PLANNER` | `false` |
| `P3_STAGE_A_TIMEOUT_MS` | `180000` |
| `P3_STAGE_B_TIMEOUT_MS` | `240000` |
| `P3_TOTAL_TIMEOUT_MS` | `480000` |
| `P3_STAGE_MAX_RETRIES` | `1` |
| `P3_STAGE_MAX_OUTPUT_CHARS` | `60000` |
| `P3_CACHE_ENABLED` | `true` |

The orchestrator supports cancellation, per-stage and total deadlines, cache
bypass, output limits, and typed failure classification.

## Validation rules

Stage A validates required fields, fact/knowledge references, clarification
preservation, lack of observability metadata, and lack of detailed operation
grounding.

Stage B validates canonical function IDs, node and edge references, binary
true/false topology, router labels/destinations, loop boundaries, merge
incoming branches, Stage A/K3.1 references, blocking clarification references,
and absence of detailed operations or final platform mappings.

Invalid artifacts fail safely and are never passed to the next stage.

## Retry and cache behavior

- Retryable malformed/schema-invalid output receives at most one corrective
  retry.
- A failed Stage A skips Stage B.
- A failed Stage B retries Stage B only and reuses the validated Stage A
  artifact.
- Deterministic K3.1 analysis is not repeated.
- Blocking clarifications are valid results, not retry reasons.
- Cache keys inherit the P2 stage/input/model/config identity design.
- The live run recorded zero cache hits.

The mocked acceptance test explicitly proves that a Stage B retry does not
rerun Stage A.

## Six-scenario live benchmark

Local model: Ollama Qwen 3 8B. Total benchmark duration: 781.99 seconds.

| Scenario | Stage A | Stage B | Result | Main issue |
|---|---|---|---|---|
| Asana CRM, five lifecycles | Invalid after retry | Skipped | Failed | 21 invalid knowledge/evidence references |
| No Response follow-up | Invalid after retry | Skipped | Failed | Unknown pattern knowledge reference |
| Approved collection | Invalid after retry | Skipped | Failed | Nine invalid fact references and one unknown pattern reference |
| Service routing | Valid after retry | Invalid after retry | Failed | Model emitted `merge`; validator's allowed canonical set rejected it |
| Gmail attachment intake | Valid | Invalid after retry | Failed | Skeleton referenced clarification ID `unknown` |
| Shopify limitation | Valid | Valid | Completed | Capability limitation remained explicit; no operation was invented |

### Stage A metrics

- Successful completions: 3/6 (50.0%)
- Timeout rate: 0/6 (0%)
- Invalid-output rate: 3/6 (50.0%)
- Retry rate: 4/6 scenarios (66.7%)
- Cache-hit rate: 0%
- Average scenario latency: 77,864 ms
- Median scenario latency: 67,326 ms
- Maximum scenario latency: 186,955 ms
- Average prompt size per attempt: 9,860 characters
- Average output size per attempt: 3,146 characters

### Stage B metrics

- Successful completions: 1/3 attempted (33.3%); 1/6 corpus-wide
- Skipped due to Stage A failure: 3/6
- Timeout rate: 0/3 attempted (0%)
- Invalid-output rate: 2/3 attempted (66.7%)
- Retry rate: 2/3 attempted scenarios (66.7%)
- Cache-hit rate: 0%
- Average attempted-scenario latency: 104,902 ms
- Median attempted-scenario latency: 139,855 ms
- Maximum attempted-scenario latency: 143,220 ms
- Average prompt size per attempt: 11,353 characters
- Average output size per attempt: 4,425 characters

### Clarification preservation

- Stage A preserved the applicable Gmail destination-folder and notification-
  owner questions, but used non-catalog clarification IDs.
- Stage B kept the Gmail clarification visible but failed validation because it
  referenced `unknown`.
- The Asana clarification-heavy scenario did not produce a valid Stage A
  artifact, so clarification preservation cannot be credited for that run.
- No successful artifact silently supplied an interval, attempt limit, owner,
  or escalation policy.

### Unsupported references and invented rules

- Unsupported application-operation references: **0**
- Silently invented blocking business policies: **0 detected**
- Invalid reference/topology validation findings: **34**
  - 32 Stage A fact/knowledge-reference findings
  - 1 Stage B canonical-function finding
  - 1 Stage B clarification-reference finding

The Shopify scenario correctly retained the known capability limitation and
did not fabricate a Shopify operation.

## Automated verification

- Shared tests: 28 passed
- Knowledge tests: 8 passed
- Platform tests: 8 passed
- Server tests: 146 passed, 3 live-only tests skipped by default
- Client tests: 4 passed
- Regular regression total: **194 passed**, 3 skipped
- P3 live benchmark: **1 harness test passed**, covering all six scenarios
- Combined executed test total: **195 passed**
- Lint: passed
- Type-check: passed for all workspaces
- Production build: passed for all workspaces

The client test/build initially encountered the managed Windows sandbox's
parent-directory restriction. Both passed when rerun with the required build
helper access. The production build retains an existing warning that the main
client bundle exceeds 500 kB after minification.

## Backward compatibility and persistence

- Production workflow-generation behavior is unchanged.
- Existing Qwen prompts are unchanged.
- The P3 experiment has no production route or caller.
- `P3_DISTRIBUTED_PLANNER` is disabled by default.
- Every live result reported `productionWorkflowUnchanged: true`.
- Every live result reported `persisted: false`.
- No database schema, persisted workflow schema, migration, or workflow set was
  changed.
- Stage failures remained contained and auditable.

## Rollback

1. Remove the six P3 source/test files and this report.
2. Remove the P3 export from `packages/shared/src/index.ts`.
3. Remove the seven P3 environment fields and their environment tests.
4. Remove the P3 test-environment values from `apps/server/src/app.test.ts`.
5. Remove P3 variables from `.env.example`.

No data rollback or migration is required because no P3 artifact is persisted.
Leaving the feature flag false also provides an immediate operational rollback.

## Known limitations and newly discovered risks

- Qwen frequently creates plausible-looking references instead of selecting
  only provided IDs.
- Corrective retries improved some outputs but did not reliably eliminate
  reference drift.
- The skeleton validator and catalog canonical vocabulary disagree about
  `merge`; this must be reconciled without weakening topology validation.
- Clarifications need stable IDs in the prompt and stronger schema guidance;
  the model substituted `unknown`.
- Multi-workflow Asana intent remains too large for reliable Stage A execution
  as one bounded task.
- Latency is high even without timeouts; a six-scenario run took about 13
  minutes.
- Prompt compaction alone is insufficient. Smaller boundary-by-boundary Stage A
  tasks, constrained ID selection, or a more capable model should be evaluated.
- Cache behavior was structurally available but not meaningfully measured
  because the live corpus produced no cache hits.
- The workspace has no valid Git metadata (`.git` is empty), so the approved P2
  commit could not be created without initializing new history. No repository
  history was fabricated.

## Recommendation

**Revise P3 and retain it as shadow-only. Do not proceed to P4 yet.**

The safest next experiment is to:

1. split Stage A by deterministic workflow-boundary candidates;
2. provide enumerated, schema-constrained reference IDs;
3. align canonical topology vocabulary, especially Merge;
4. require clarification IDs to be selected from a closed list; and
5. rerun the same six scenarios before considering grounding stages.

## Recommended Git commit message

`feat(analysis): add shadow P3 intent and skeleton experiment`

