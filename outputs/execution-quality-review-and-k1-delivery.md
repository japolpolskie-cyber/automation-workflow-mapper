# Final Execution-Quality Review and K1 Delivery

Date: 2026-07-16  
Decision: K1 implemented; K2 not started

## Principal architect conclusion

For this existing codebase, the K1–K9 roadmap remains the safest sequence. It separates contracts, knowledge, retrieval, model behavior, validation, repair, platform projection, persistence migration, and hardening so that each risk can be measured independently.

The audit produces two ordering refinements:

1. K7 does not technically require K6. It requires K2 and K5; scheduling it after K6 is a release-quality choice, not a code dependency.
2. K8 does not technically require K7, but should follow it so the workflow-set migration does not overlap a platform-mapping redesign.

One planned dependency must change: `packages/shared` must remain the lowest-level domain package and must not import `packages/knowledge`. The future knowledge package may depend on shared contracts; server/platform packages may depend on both. This prevents a circular monorepo dependency.

---

## K1 — Planning Contracts and Pipeline Observability

1. **Why it exists:** Later stages need stable, strict artifacts for facts, retrieved knowledge, repair reports, progress, and future workflow sets. Without contracts, every stage would invent its own shapes.
2. **If skipped:** K2–K6 become tightly coupled through informal objects; prompt, validation, and repair changes become difficult to test independently.
3. **Could it merge?** It could merge with K2 in a greenfield project. In this brownfield system, keeping K1 separate proves backward compatibility before new knowledge is introduced.
4. **Debt removed:** Monolithic implicit analysis flow; absence of intermediate contracts; inability to add observability safely.
5. **Debt introduced:** Premature contracts can ossify wrong assumptions. Mitigation: version all new artifacts and keep them additive/non-persisted.
6. **Assumptions:** Existing canonical workflow remains authoritative; Zod remains the runtime schema system; future stages can use versioned contracts.
7. **Failure scenarios:** Contract overdesign; shared-package dependency cycles; observability errors affecting analysis; accidental API changes.
8. **Success criteria:** Existing output is identical; no prompt/API/database/UI behavior changes; reporter failures cannot affect generation; schemas reject invalid references; all release checks pass.
9. **Future features enabled:** Knowledge retrieval, real progress, repair reporting, evidence-backed clarifications, and workflow-set migration contracts.
10. **Ordering change?** No. K1 remains first.

## K2 — Canonical Knowledge Catalog and Operation Packs

1. **Why it exists:** Qwen and platform adapters need a grounded list of supported functions and operations.
2. **If skipped:** Retrieval has nothing authoritative to retrieve; the model and adapters continue inventing or guessing operations.
3. **Could it merge?** Could merge with K3 for speed, but that would make catalog defects indistinguishable from retrieval defects. Keep separate.
4. **Debt removed:** String-based operation lists, generic application guidance, unsupported equivalence claims.
5. **Debt introduced:** Catalog maintenance burden, version drift, and duplication with existing registries.
6. **Assumptions:** Initial applications cover a useful majority of benchmark scopes; structured facts outperform long prose manuals.
7. **Failure scenarios:** Incorrect capability data; duplicate registries; missing limitations; shared↔knowledge circular dependency.
8. **Success criteria:** Unique IDs; valid references; every operation declares inputs/outputs/cardinality; unsupported mappings declare limitations; existing adapters still pass.
9. **Future features enabled:** Capability-constrained generation, operation validation, precise node suggestions, platform confidence.
10. **Ordering change?** No, but revise dependency direction: `knowledge → shared`; never `shared → knowledge`.

## K3 — Deterministic Facts, Retrieval, and Clarifications

1. **Why it exists:** The system needs inspectable understanding before asking Qwen to design a graph.
2. **If skipped:** K4 merely becomes a larger static prompt; there is no evidence trail, selective context, or reliable clarification source.
3. **Could it merge?** Pattern matching and retrieval belong together. UI presentation could be separate, but a small visible summary is valuable acceptance evidence.
4. **Debt removed:** Hard-coded local-provider regex logic, generic clarification questions, no cardinality detection.
5. **Debt introduced:** Rule/synonym maintenance, false positives, language bias, and scoring thresholds.
6. **Assumptions:** The initial domain can be served by deterministic lexical/entity rules; vector search is unnecessary at current catalog size.
7. **Failure scenarios:** Misclassifying a single record as a collection; overmatching patterns; treating uncertainty as fact; excessive retrieval context.
8. **Success criteria:** Benchmark precision/recall targets on curated real scopes; retrieval size budget; every detected fact has evidence; missing facts produce clarifications; shadow mode does not alter generation.
9. **Future features enabled:** Grounded prompts, explainable decisions, user confirmation before generation, retrieval analytics.
10. **Ordering change?** No. It is the first safe user-visible milestone after K1–K2.

## K4 — Grounded Qwen Planning

1. **Why it exists:** Retrieved knowledge has no product value until it constrains and informs the planner.
2. **If skipped:** K2–K3 remain diagnostics only; generated workflows stay as they are.
3. **Could it merge?** Do not merge with K3. Shadow retrieval must be evaluated before changing model behavior.
4. **Debt removed:** One oversized generic prompt, ungrounded operation invention, dependence on Qwen’s prior automation knowledge.
5. **Debt introduced:** Prompt-version management, context budgeting, model-specific behavior, feature-flag branches.
6. **Assumptions:** Qwen follows concise structured context better than unfiltered manuals; the retrieved capability allowlist is accurate.
7. **Failure scenarios:** Prompt regression, context overflow, lower JSON compliance, ignored capabilities, slower local inference.
8. **Success criteria:** Better benchmark structure and specificity without lower schema-valid rate; prompt stays within budget; irrelevant packs excluded; old prompt remains a rollback option.
9. **Future features enabled:** Model comparisons, catalog-grounded assistants, targeted repair prompts, explainable generation provenance.
10. **Ordering change?** No. It must remain after shadow-mode evaluation.

## K5 — Semantic Validation

1. **Why it exists:** Schema validity cannot prove that a workflow makes business or data-flow sense.
2. **If skipped:** K6 has no reliable issue input; invalid iterators, loops, routes, and unsupported operations can be persisted.
3. **Could it merge?** It could share a release with K6, but implementation and acceptance must remain sequential: detect correctly before repairing.
4. **Debt removed:** Topology-only validation, broad warnings, inability to reason about cardinality and control semantics.
5. **Debt introduced:** Validator-version complexity, compatibility modes, graph-analysis maintenance.
6. **Assumptions:** Canonical semantics and operation capabilities are sufficiently explicit to validate deterministically.
7. **Failure scenarios:** False errors blocking valid workflows; graph traversal errors; legacy workflows suddenly invalid; inconsistent severity policy.
8. **Success criteria:** Required semantic scenarios pass; false-positive benchmark rate is acceptable; legacy findings initially degrade to warnings; issues identify exact nodes/edges and repair IDs.
9. **Future features enabled:** Safe repair, quality scoring, pre-export gates, automated regression evaluation.
10. **Ordering change?** No. K5 must precede K6 and strongly inform K7.

## K6 — Deterministic and Targeted Repair

1. **Why it exists:** Regenerating an entire workflow wastes correct work and can introduce new errors.
2. **If skipped:** Users repeatedly regenerate or manually fix known structural defects; invalid graphs remain blocked without recovery.
3. **Could it merge?** Deterministic and AI repair may share one sprint only if shipped in two feature-flagged stages. Do not merge K5 and K6.
4. **Debt removed:** Whole-result fallback, compiler invention of missing business meaning, unlogged repairs.
5. **Debt introduced:** Repair-rule ordering, patch-schema evolution, confidence policy, idempotency requirements.
6. **Assumptions:** A meaningful subset of defects is safely repairable; ambiguous meaning can be surfaced as clarification.
7. **Failure scenarios:** Plausible but wrong repair; repair loops; patching the wrong node; validation/repair disagreement; model changes correct fragments.
8. **Success criteria:** Safe rules are idempotent; bounded attempts; every change logged; ambiguity creates clarification; full revalidation passes; prior version remains restorable.
9. **Future features enabled:** One-click repair preview, quality assurance reports, assistant fixes scoped to selected issues.
10. **Ordering change?** No. This remains after K5. It has the highest business-logic correctness risk.

## K7 — Capability-Aware Platform Mapping

1. **Why it exists:** Platform plans must reflect actual Zapier/Make/n8n semantics rather than cosmetic label changes.
2. **If skipped:** Canonical intelligence improves but implementation recommendations remain generic or misleading.
3. **Could it merge?** K2 defines capability data; K7 should not merge with it because mapping needs validated graph semantics from K5.
4. **Debt removed:** Category aliases, first-word event matching, conflation of Filter/IF/Paths/Router.
5. **Debt introduced:** Platform catalog versioning and ongoing vendor-change maintenance.
6. **Assumptions:** Canonical workflows contain enough semantics to choose platform constructs; honest limitations are acceptable product output.
7. **Failure scenarios:** Claiming native support incorrectly; canonical mutation during conversion; stale platform catalogs; inconsistent confidence.
8. **Success criteria:** Required cross-platform mapping benchmarks pass; canonical graph hash/data remains unchanged; limitations surface; fallback adapter remains available.
9. **Future features enabled:** Higher-quality exports, implementation checklists, platform suitability scoring, catalog updates independent of generation.
10. **Ordering change?** Technical dependency is K2+K5, not K6. Keep it after K6 operationally to reduce simultaneous behavior changes.

## K8 — Workflow Sets and True Layered Views

1. **Why it exists:** One scope can describe several independent automations; one giant graph is the wrong aggregate.
2. **If skipped:** Multi-process scopes continue producing oversized or disconnected graphs; views and exports cannot isolate automations.
3. **Could it merge?** Do not merge with another sprint. It is already the largest migration boundary.
4. **Debt removed:** One-workflow project assumption, array-order Business View, fake Developer layer, project-level visual graph.
5. **Debt introduced:** Workflow selection state, workflow-scoped APIs/versions/layouts, compatibility adapter lifetime.
6. **Assumptions:** A project is the correct parent aggregate; existing workflows can be wrapped losslessly; users understand workflow selection.
7. **Failure scenarios:** ID/layout loss, partial migration, wrong workflow edited/exported, version restore mismatch, stale client state.
8. **Success criteria:** Idempotent additive migration; exact ID preservation; five-stage Asana scope yields five graphs; each graph validates/maps/exports independently; old projects open correctly.
9. **Future features enabled:** Per-workflow archive/versioning, reusable sub-workflows, workflow templates, portfolio analytics.
10. **Ordering change?** No. It remains isolated and late. It carries the highest overall regression and migration risk.

## K9 — Layout, Progress, Performance, and Hardening

1. **Why it exists:** Intelligence is not usable if large workflows overlap, progress is fictional, or local analysis cannot be controlled.
2. **If skipped:** Large graphs remain difficult to review; users cannot distinguish slow work from failure; performance regressions go unnoticed.
3. **Could it merge?** Small progress plumbing starts in K1, but UI streaming and branch-aware layout should remain K9 after graph semantics stabilize.
4. **Debt removed:** Estimated client-only progress, generic Dagre placement, missing cancellation and performance baselines.
5. **Debt introduced:** Job-state lifecycle, streaming/polling infrastructure, layout-version compatibility, performance test maintenance.
6. **Assumptions:** K5/K8 expose stable branch/workflow semantics; existing layout remains a usable fallback.
7. **Failure scenarios:** Lost progress events, unclosed jobs, layout instability, memory growth, cancellation leaving persisted partial work.
8. **Success criteria:** Deterministic non-overlapping 20/40-node benchmarks; ordered terminal progress; safe cancellation; bounded resource use; all prior regressions pass.
9. **Future features enabled:** Background jobs, resumable analysis, operational dashboards, collaborative status, larger enterprise workflows.
10. **Ordering change?** No. Hardening should follow stable semantics and persistence.

---

## Dependency audit

### Required dependency graph

```text
K1 Contracts
 ├──→ K2 Knowledge Catalog
 │      ├──→ K3 Facts + Retrieval + Clarifications
 │      │      └──→ K4 Grounded Qwen Planning
 │      │              └──→ K5 Semantic Validation
 │      │                      ├──→ K6 Deterministic + Targeted Repair
 │      │                      └──→ K7 Platform Mapping
 │      └──────────────────────────→ K7 Platform Mapping
 ├───────────────────────────────→ K5 Semantic Validation
 └────────────────────────────────────────────────→ K9 Real Progress

K3 Clarifications ───────────────→ K6 Ambiguous-repair handling
K4 Provider context ─────────────→ K6 Targeted AI repair

K1 Workflow-set preview
K4 Multi-workflow planning readiness
K5 Per-graph validation
K6 Per-graph repair stability
K7 Per-graph platform mapping stability
  └──→ K8 Persisted Workflow Sets + Layered Views

K5 Branch semantics + K8 Workflow identity
  └──→ K9 Branch-aware Layout + Hardening
```

### Simplified release sequence

```text
K1 → K2 → K3 → K4 → K5 → K6 → K7 → K8 → K9
```

The release sequence is intentionally stricter than the minimum code dependencies.

### Hidden dependencies

- **Package direction:** `knowledge` may depend on `shared`; `shared` must never depend on `knowledge`.
- **K3 depends on benchmark governance:** scoring cannot be accepted without curated real-world scopes and expected facts.
- **K4 depends on prompt versioning and token budgeting,** not merely retrieval output.
- **K5 depends on canonical taxonomy compatibility,** even though taxonomy migration is not a separate sprint.
- **K6 depends on immutable project versions** for safe rollback, an existing capability that must be verified continuously.
- **K7 depends on vendor catalog governance** and catalog versions, not only code.
- **K8 depends on editor state isolation** and visual graph scoping, not merely database migration.
- **K9 depends on stable route/loop metadata** from K5 and workflow identity from K8.

### Circular dependencies

No required conceptual cycle exists.

A potential package cycle would occur if K2 made `packages/shared` import `packages/knowledge` while knowledge imports shared contracts. The corrected rule is:

```text
shared ← knowledge
shared ← platforms
shared + knowledge + platforms ← server
shared + platforms ← client
```

### Unnecessary dependencies

- K7 does not require K6 at compile time; it requires K2 and K5. Keeping K6 first is sequencing discipline.
- K8 does not strictly require K7, but overlapping mapping and persistence changes would raise regression risk.
- K5 does not require K4 to exist; it can validate fixtures. K4 is needed for realistic integration evaluation.
- K9 progress transport does not require K8, but branch-aware layout does. The sprint stays unified to avoid two hardening phases.

---

## Risk heatmap

| Sprint | Architecture | Regression | Migration | Performance | Maintainability | Testing complexity |
|---|---|---|---|---|---|---|
| K1 | Low | Low | Very Low | Very Low | Low | Low |
| K2 | Medium | Low | Very Low | Low | Medium | Medium |
| K3 | Medium | Medium | Very Low | Medium | Medium | High |
| K4 | High | High | Low | High | Medium | High |
| K5 | High | High | Low | Medium | High | Very High |
| K6 | Very High | Very High | Low | Medium | Very High | Very High |
| K7 | High | Medium | Low | Low | High | High |
| K8 | Very High | Very High | Very High | Medium | High | Very High |
| K9 | Medium | Medium | Low | High | Medium | High |

---

## Greenfield answer

If starting from scratch today, I would preserve the same architectural capabilities but would not use exactly the same nine-sprint roadmap.

For a greenfield system I would:

1. Design `Project → WorkflowSet → CanonicalWorkflow[]` from the beginning instead of deferring it to K8.
2. Define canonical contracts and the knowledge catalog together because there is no backward-compatibility boundary to prove.
3. Keep semantic validation and repair as separate internal milestones but deliver them under one quality epic.
4. Build view visibility and workflow identity into the canonical model before the first editor.
5. Establish real progress/job semantics before UI progress exists.

The greenfield roadmap would likely be seven phases:

```text
Domain + workflow sets + contracts
→ Knowledge catalog
→ Facts + retrieval
→ Grounded planning
→ Semantic validation then repair
→ Platform mapping + layered views
→ Layout, progress, and hardening
```

For this existing product, however, K1–K9 is better because it isolates backward compatibility and migration risk.

---

# K1 Delivery Report

## Architecture summary

K1 adds four strict, versioned contract modules and one optional analysis pipeline boundary:

- Planning facts, evidence, cardinality, decisions, rules, and clarifications
- Compact retrieved knowledge and capability context
- Transparent bounded repair reports
- Analysis progress events
- A non-persisted workflow-set preview contract
- A reporter-safe `AnalysisPipeline` that wraps the existing analysis operation without changing its result

The reporter deliberately swallows observability failures so telemetry cannot break workflow generation. The current `AnalysisService` logic, prompts, providers, compilation, validation, fallback, persistence, and API result remain unchanged inside the wrapper.

## Files created

- `packages/shared/src/planning-facts.ts`
- `packages/shared/src/knowledge-context.ts`
- `packages/shared/src/repair-report.ts`
- `packages/shared/src/analysis-progress.ts`
- `packages/shared/src/planning-facts.test.ts`
- `packages/shared/src/knowledge-context.test.ts`
- `packages/shared/src/repair-report.test.ts`
- `packages/shared/src/analysis-progress.test.ts`
- `apps/server/src/analysis/analysis-pipeline.ts`
- `apps/server/src/analysis/analysis-pipeline.test.ts`

## Files modified

- `packages/shared/src/index.ts` — exports the new contracts.
- `apps/server/src/services/analysis-service.ts` — wraps the unchanged analysis body in the optional pipeline boundary.

No prompt, provider, route, database, repository, domain workflow schema, platform adapter, client, or UI file was modified.

## New public contracts

- `EvidenceReference`
- `DataCardinality`
- `DetectedApplication`
- `DetectedEntity`
- `DetectedDecision`
- `BusinessRuleFact`
- `ClarificationRequirement`
- `PlanningFacts`
- `WorkflowSetPreview`
- `RetrievedKnowledgeRef`
- `AllowedCapability`
- `KnowledgeContext`
- `RepairAction`
- `RepairReport`
- `AnalysisStage`
- `AnalysisProgressState`
- `AnalysisProgressEvent`
- `AnalysisProgressReporter`
- `AnalysisPipelineContext`
- `AnalysisPipeline`

All shared data contracts have strict Zod schemas and inferred TypeScript types.

## Real-world benchmark

The K1 benchmark models a realistic Asana CRM lifecycle involving:

- Asana lead-stage triggers
- Google Drive folder/attachment processing
- Gmail follow-up messages
- A binary “Did the lead respond?” decision
- Single lead cardinality
- Collection cardinality for attachments
- A repeated follow-up rule
- A required clarification for the missing attempt limit
- Evidence references back to realistic scope statements

The benchmark proves the contracts can represent grounded facts, decisions, collection semantics, business rules, evidence, and clarification needs without changing generation behavior.

## Tests added

- 8 shared contract/benchmark tests across four new test files
- 3 server pipeline compatibility tests
- Total new K1 tests: 11

## Full test results

- Lint: passed
- Full workspace type-check: passed
- Shared tests: 25 passed
- Platform tests: 8 passed
- Server tests: 27 passed
- Client tests: 2 passed
- Total: **62 passed, 0 failed**
- Full production build: passed

The existing Vite bundle-size warning remains; it predates K1 and is not caused by these contracts.

## Backward compatibility verification

- Existing workflow schema unchanged.
- Existing project/database schema unchanged.
- Existing API requests and responses unchanged.
- Existing prompts unchanged.
- Ollama/OpenAI/local provider inputs and behavior unchanged.
- Existing fallback, compiler, validation, persistence, platform conversion, assistant, editor, and exports unchanged.
- Existing API integration tests passed without modification.
- Analysis pipeline tests prove return values and thrown errors retain identity/behavior.
- Reporter failures are isolated from generation.

## Screenshots

Not applicable. K1 contains no UI changes.

## Breaking changes

None.

## Migration notes

No migration is required. `WorkflowSetPreview` is a non-persisted future contract and does not alter `Project.workflow`.

## Known limitations

- The contracts are not populated by fact extraction yet; that belongs to K3.
- The knowledge context has no active catalog yet; that belongs to K2.
- Progress events are not exposed over an API or shown in the UI.
- Repair contracts do not execute repairs.
- Workflow sets are preview-only and not persisted.

## Newly discovered architectural concerns

1. Avoid a `shared ↔ knowledge` package cycle in K2. Shared must stay dependency-free from knowledge.
2. `WorkflowSetPreview` should remain explicitly non-persisted until K8; allowing early persistence would create an accidental half-migration.
3. Future progress reporters need backpressure/error isolation; K1 intentionally makes reporting non-blocking from a correctness perspective.
4. Evidence offsets may require document-section identifiers when multiple uploaded sources are supported; the versioned schema permits an additive future extension.

## Suggested Git commit message

`feat(analysis): add additive K1 planning and observability contracts`

## Stop condition

K1 is complete and releasable. K2 has not started and requires explicit approval.
