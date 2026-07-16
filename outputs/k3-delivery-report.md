# K3 Delivery Report — Deterministic Scope Intelligence

## Architecture summary

K3 adds a deterministic, explainable analysis layer around the existing workflow generator. It runs before provider generation, but its output is never included in the provider input. The result is returned as optional analysis metadata and is not written to project or workflow persistence.

The implementation is additive:

- `packages/shared` owns platform-neutral public evidence and detected-process contracts.
- `packages/knowledge` extends K2 with versioned workflow patterns and rule manuals.
- `apps/server` owns rule execution, evidence scoring, clarification detection, and selective retrieval.
- `apps/client` renders optional metadata in a removable Detected Process Summary.
- `packages/shared` does not import `packages/knowledge`; the dependency remains `knowledge → shared`.

K3 does not change Qwen prompts, provider input, workflow compilation, database schemas, or stored workflows. It adds no vector search and does not begin K4.

## Exact files created

- `packages/shared/src/detected-process.ts`
- `packages/knowledge/src/patterns.ts`
- `apps/server/src/analysis/scope-intelligence.ts`
- `apps/server/src/analysis/scope-intelligence.test.ts`
- `apps/client/src/components/DetectedProcessSummary.tsx`
- `apps/client/src/components/DetectedProcessSummary.test.tsx`
- `outputs/k3-detected-process-summary.png`
- `outputs/k3-delivery-report.md`

## Exact files modified

- `package.json`
- `package-lock.json`
- `packages/shared/src/index.ts`
- `packages/shared/src/domain.ts`
- `packages/knowledge/src/index.ts`
- `packages/knowledge/tsconfig.json`
- `apps/server/package.json`
- `apps/server/src/config/environment.ts`
- `apps/server/src/app.ts`
- `apps/server/src/app.test.ts`
- `apps/server/src/services/analysis-service.ts`
- `apps/server/src/services/analysis-service.test.ts`
- `apps/client/src/components/ScopeWorkspace.tsx`
- `apps/client/src/styles.css`

## Implemented rules and versions

Rule engine version: `1.0.0`

Evidence scoring rule: `weighted-evidence-v1` version `1.0.0`

Initial pattern definitions:

1. `follow-up-until-response`
2. `create-or-update-record`
3. `process-approved-collection`
4. `scheduled-reminder`
5. `deduplicate-before-create`
6. `service-based-routing`

Rule manuals:

- `iterator-manual`
- `binary-condition-manual`
- `multi-route-manual`
- `clarification-manual`

Detected fact categories include applications, entities, business verbs, decisions, routes, repetitions, cardinality, patterns, and uncertainties.

Evidence types include explicit, linguistic, semantic, pattern, derived, and missing information. Every evidence item contains confidence, weight, rule identity and version, category, source range, exact evidence text or structured missing information, explanation, relationship, related evidence, and supporting fact references.

## Evidence-scoring formula

Evidence-type priority multipliers:

- Explicit: `1.00`
- Linguistic: `0.80`
- Semantic: `0.75`
- Pattern: `0.70`
- Derived: `0.60`
- Missing information: `0.50`

For each evidence item:

`effective weight = configured weight × evidence-type multiplier`

Then:

`raw confidence = max(0, min(1, (weighted support - weighted conflict) / total effective weight))`

`final confidence = raw confidence × (1 - completeness penalty)`

The response exposes weighted support, weighted conflict, total weight, completeness penalty, precedence order, evidence IDs, formula, scoring-rule ID/version, and final confidence. Values are rounded deterministically to four decimal places.

Missing information is represented as missing/conflicting evidence and creates a clarification. Explicit evidence receives greater effective weight than weaker inference. Derived evidence links to both its supporting evidence and detected facts.

## Retrieval behavior and size limits

Retrieval is structured and deterministic. It selects only:

- explicitly detected application packs;
- operations matched by versioned phrase rules;
- canonical functions required by detected decisions, cardinality, or patterns;
- matched pattern definitions;
- relevant rule manuals.

Default maximum context size: `12,000` characters.

Configuration: `K3_KNOWLEDGE_BUDGET`, accepted range `1,000–50,000`.

Candidates are added in deterministic order until the budget is exhausted. The context reports used characters, maximum characters, and whether entries were truncated. It is analysis metadata only and is not sent to Qwen in K3.

## Detected Process Summary UI

The analysis result now optionally shows:

- detected applications;
- decisions and named routes;
- cardinality;
- business actions and entities;
- repeated work and matched patterns;
- uncertainties and clarification requirements;
- expandable evidence and reproducible confidence calculations;
- selected knowledge size versus configured budget;
- an explicit shadow-mode explanation.

The UI renders only when `detectedProcess` exists. Existing saved workflows remain readable and do not require this metadata.

Screenshot: [K3 Detected Process Summary](./k3-detected-process-summary.png)

## Asana CRM benchmark output

The real-world benchmark detected:

- Applications: Asana, Google Drive, Gmail, Google Sheets (`99%` each)
- Binary decision: “Did the lead respond?” (`93%`)
- Multi-route decision: service-type routing (`94%`)
- Routes: Cleaning, Maintenance, Repair, Installation (`98%` each)
- Cardinality: collection from “For each approved attachment” (`95%`)
- Pattern: Follow Up Until Response (`91%`)
- Pattern: Process Approved Collection (`91%`)
- Pattern: Service-Based Routing (`91%`)
- Repeated work (`90%`)

Clarifications correctly requested:

- follow-up interval;
- maximum follow-up attempts;
- escalation policy;
- approval owner.

Gmail provided explicit communication-channel evidence, so no channel clarification was incorrectly requested. Exact evidence ranges reproduce the corresponding scope substrings. A separate conflict benchmark preserves simultaneous collection and single-record evidence and asks for cardinality clarification.

Selective retrieval used `11,949 / 12,000` characters in the live benchmark. A `3,000`-character test confirmed deterministic truncation and exclusion of irrelevant Slack knowledge.

## Complete test results

- Shared: 25 passed
- Knowledge: 8 passed
- Platforms: 8 passed
- Server: 43 passed
- Client: 3 passed
- Total: **87 passed, 0 failed**

Additional verification:

- ESLint: passed
- Full TypeScript typecheck: passed
- Full production build: passed
- Existing client bundle-size warning remains; no build error
- Visual browser verification: passed

Coverage includes explicit precedence, linguistic collection detection, semantic binary decisions, multi-route decisions, all six patterns, derived traceability, conflicts, missing-information scoring, reproducibility, versioning, exact source traceability, no false iterator for one record, retrieval budgets, unchanged provider input, unchanged stored workflow shape, feature-off behavior, K1/K2 regressions, and UI rendering.

## Backward compatibility

- Qwen/provider input remains exactly `{ scope, projectName, platform }`.
- No prompt files changed.
- No generation algorithm or generated workflow schema changed.
- `detectedProcess` is optional on the analysis response.
- Metadata is not stored in the database or canonical workflow.
- Existing project records require no migration.
- Existing platform adapters are unchanged.
- K1 and K2 tests remain passing.
- The `shared → knowledge` dependency is still prohibited and the K2 boundary test passes.

## Feature flag and rollback

Feature flag: `K3_SCOPE_INTELLIGENCE=true|false`, default `true`.

Set `K3_SCOPE_INTELLIGENCE=false` and restart the server to remove K3 computation and response metadata. The client then automatically hides the summary because the optional field is absent.

No data rollback or migration is required. The knowledge budget can be adjusted independently with `K3_KNOWLEDGE_BUDGET`.

## Newly discovered risks

1. Deterministic phrase rules are intentionally conservative. Unusual phrasing may remain undetected until rule coverage expands.
2. Generic nouns such as “record” need application context; K3 does not guess a CRM vendor.
3. Pattern/rule governance needs change history and benchmark regression data as the catalog grows.
4. Source locations are character ranges. Document-level page/section locations will require richer ingestion provenance later.
5. The 12,000-character budget is safe for current catalogs but should eventually be complemented by per-kind quotas so a large application pack cannot crowd out manuals.
6. Confidence expresses deterministic rule support, not the probability that the eventual automation will satisfy every unstated business expectation.
7. The existing production bundle still exceeds Vite’s 500 kB advisory threshold; this predates K3 and should be addressed separately through code splitting.

## Breaking changes and migration notes

- Breaking changes: none.
- Database migrations: none.
- Persisted workflow migrations: none.
- API change: one optional additive response field.

## Recommended Git commit message

`feat(analysis): add deterministic K3 scope intelligence`

## Approval boundary

K3 is complete and releasable. K4 has not started.
