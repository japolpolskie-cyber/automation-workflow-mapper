# Automation Knowledge Engine — Detailed K1–K9 Sprint Plan

Date: 2026-07-16  
Status: Approved architecture; implementation not started

## Delivery rules applying to every sprint

- Each sprint ends with passing type-check, lint, unit, integration, and relevant UI tests.
- Existing workflows remain readable throughout the migration period.
- New generation behavior is feature-flagged until regression fixtures pass.
- Canonical workflow data remains the source of truth; platform and view models remain projections.
- No automatic repair may invent ambiguous business meaning.
- Every stored mutation creates or preserves a project version.
- Derived knowledge, platform plans, and visual layouts are never competing workflow sources.

---

## K1 — Planning Contracts and Pipeline Observability

### 1. Sprint title

Planning Contracts and Pipeline Observability.

### 2. Exact objective

Define strict, versioned contracts for the intermediate data that will pass between scope analysis, retrieval, planning, validation, repair, platform mapping, and progress reporting. Add the contracts without changing Qwen’s current prompt or generated workflow behavior.

### 3. Existing files to modify

- `packages/shared/src/domain.ts` — reference new planning types where needed; do not replace existing workflow fields.
- `packages/shared/src/api.ts` — expose optional planning/progress response envelopes.
- `packages/shared/src/index.ts` — export new contracts.
- `apps/server/src/services/analysis-service.ts` — introduce internal pipeline stage boundaries while retaining current execution.
- `apps/server/src/routes/analysis.ts` — return the existing result unchanged, with optional metadata only if backward-compatible.
- `apps/server/src/services/analysis-service.test.ts`
- `apps/server/src/app.test.ts`

### 4. New files to create

- `packages/shared/src/planning-facts.ts`
- `packages/shared/src/knowledge-context.ts`
- `packages/shared/src/repair-report.ts`
- `packages/shared/src/analysis-progress.ts`
- `packages/shared/src/planning-facts.test.ts`
- `packages/shared/src/knowledge-context.test.ts`
- `apps/server/src/analysis/analysis-pipeline.ts`
- `apps/server/src/analysis/analysis-pipeline.test.ts`

### 5. Public interfaces or schemas affected

New public schemas/types:

- `PlanningFacts`
- `EvidenceReference`
- `DetectedApplication`
- `DetectedEntity`
- `DetectedDecision`
- `CardinalityFact`
- `ClarificationRequirement`
- `KnowledgeContext`
- `RetrievedKnowledgeRef`
- `RepairAction`
- `RepairReport`
- `AnalysisStage`
- `AnalysisProgressEvent`
- `WorkflowSet` as a non-persisted preview contract only; persistence is deferred to K8

Existing `WorkflowAnalysisResult` remains compatible. No required field is added to existing requests.

### 6. Data migration impact

None. No database columns or stored workflow schemas change. Existing projects and versions remain byte-compatible.

### 7. Tests to add

- Strict parsing and unknown-property rejection for every new schema.
- Evidence references must identify source text ranges or rule identifiers.
- Confidence values remain between 0 and 1.
- Clarification requirements distinguish missing facts from assumptions.
- Progress stages have valid ordering and terminal states.
- Pipeline wrapper produces the same workflow as the current `AnalysisService`.
- Existing API response remains backward-compatible.

### 8. Expected user-visible behavior

No intended workflow-generation change. At most, analysis logs and development diagnostics become clearer. The app should look and behave the same.

### 9. Rollback risk

Low. New contracts and the pipeline wrapper can be removed without touching persisted data. The old analysis path remains available during the sprint.

### 10. Dependencies on earlier sprints

None. K1 is the foundation for all later K-sprints.

---

## K2 — Canonical Knowledge Catalog and Application Operation Packs

### 1. Sprint title

Canonical Knowledge Catalog and Application Operation Packs.

### 2. Exact objective

Create a typed, queryable knowledge package describing canonical automation functions, operation capabilities, cardinality constraints, common mistakes, and honest platform limitations. It must coexist with the current application registry and platform catalogs.

### 3. Existing files to modify

- Root `package.json` — register the new workspace through the existing workspace pattern if no change is needed; add scripts only if required.
- `package-lock.json` — workspace metadata update.
- `packages/shared/src/application-registry.ts` — adapt or delegate lookups to the knowledge package without breaking current imports.
- `packages/shared/src/index.ts`
- `packages/platforms/src/catalogs.ts` — reference knowledge IDs where possible while retaining current catalog results.
- `packages/platforms/src/adapter.ts` — optional knowledge lookup fallback; no mapping behavior change yet.
- `packages/platforms/package.json`
- `apps/server/package.json`

### 4. New files to create

- `packages/knowledge/package.json`
- `packages/knowledge/tsconfig.json`
- `packages/knowledge/src/types.ts`
- `packages/knowledge/src/canonical-registry.ts`
- `packages/knowledge/src/application-packs.ts`
- `packages/knowledge/src/platform-capabilities.ts`
- `packages/knowledge/src/index.ts`
- `packages/knowledge/src/canonical-registry.test.ts`
- `packages/knowledge/src/application-packs.test.ts`
- `packages/knowledge/src/platform-capabilities.test.ts`

Initial packs:

- Asana
- Google Drive
- Google Sheets
- Gmail
- Slack
- Webhook/Generic API
- Generic CRM

### 5. Public interfaces or schemas affected

New interfaces:

- `CanonicalFunctionDefinition`
- `ApplicationPack`
- `OperationDefinition`
- `OperationInputDefinition`
- `OperationOutputDefinition`
- `DataCardinality`
- `CompatibilityRule`
- `PlatformCapabilityDefinition`
- `PlatformOperationMapping`
- `CapabilityLimitation`
- `KnowledgeCatalogVersion`

No existing canonical workflow schema fields become required.

### 6. Data migration impact

None. Catalog data is code/versioned configuration, not stored project data. Stored nodes continue using their existing application and operation strings.

### 7. Tests to add

- Unique canonical function, application, and operation IDs.
- Every operation references a valid application and canonical function.
- Required inputs and outputs have valid cardinality definitions.
- Single-item and batch support cannot contradict each other.
- Unsupported platform mappings include a limitation instead of a fabricated equivalent.
- Existing application aliases still resolve correctly.
- Existing platform adapter tests remain unchanged and passing.

### 8. Expected user-visible behavior

No major UI change. If catalog-backed labels are exposed in development or node details, suggestions may become more consistent, but Qwen generation remains unchanged.

### 9. Rollback risk

Low. Existing registries remain fallback sources. Removing the package restores previous behavior without data conversion.

### 10. Dependencies on earlier sprints

K1 contracts, especially shared knowledge-reference and cardinality types.

---

## K3 — Deterministic Scope Facts, Pattern Matching, Retrieval, and Clarifications

### 1. Sprint title

Deterministic Scope Intelligence and Knowledge Retrieval.

### 2. Exact objective

Analyze plain-language scope text without AI to detect applications, entities, business verbs, decisions, repeated work, collections, likely patterns, uncertainties, and clarification requirements. Retrieve a compact, inspectable knowledge context. Run in shadow mode first; do not yet alter Qwen’s prompt.

### 3. Existing files to modify

- `apps/server/src/services/analysis-service.ts` — run the fact/retrieval stage before the existing provider call and retain diagnostics.
- `apps/server/src/routes/analysis.ts` — optionally expose a development-only inspection endpoint or metadata.
- `apps/server/src/ai/providers/local-provider.ts` — reuse shared detectors instead of duplicating selected regex knowledge where safe.
- `apps/server/src/config/environment.ts` — add a feature flag for retrieval shadow mode if needed.
- `packages/shared/src/api.ts`
- `packages/shared/src/index.ts`
- `apps/client/src/components/ScopeWorkspace.tsx` — display deterministic clarification requirements and a concise “Detected process” summary.
- `apps/client/src/api/projects.ts`
- `apps/client/src/styles.css`

### 4. New files to create

- `packages/knowledge/src/patterns.ts`
- `packages/knowledge/src/patterns.test.ts`
- `packages/knowledge/src/retrieval.ts`
- `packages/knowledge/src/retrieval.test.ts`
- `apps/server/src/analysis/scope-analyzer.ts`
- `apps/server/src/analysis/business-rule-extractor.ts`
- `apps/server/src/analysis/cardinality-detector.ts`
- `apps/server/src/analysis/pattern-matcher.ts`
- `apps/server/src/analysis/knowledge-context-builder.ts`
- Corresponding server unit tests
- `apps/client/src/features/analysis/DetectedProcessSummary.tsx`

Initial patterns:

- Follow Up Until Response
- Create or Update Record
- Process Approved Collection
- Scheduled Reminder
- Deduplicate Before Create
- Service-Based Routing

### 5. Public interfaces or schemas affected

- `PlanningFacts` becomes populated at runtime.
- `ClarificationRequirement` becomes a generated output.
- `KnowledgeContext` contains matched manuals/functions, applications, operations, patterns, scores, reasons, and catalog version.
- Analysis diagnostics may add optional `planningFacts` and `knowledgeContextSummary` metadata; existing clients must not require it.

### 6. Data migration impact

None required. Shadow results are transient. If diagnostics are persisted later, they should be stored as version metadata, not embedded as a second source of workflow truth.

### 7. Tests to add

- Detect binary conditions from “if,” “whether,” “approved/rejected,” and similar language.
- Detect multi-route decisions from three or more enumerated outcomes.
- Distinguish one record from collections using “each,” “every,” “batch,” arrays, attachments, and lists.
- Match follow-up, create-or-update, deduplication, scheduled reminder, and collection-processing patterns.
- Avoid false iterator detection for a single lead/task/file.
- Produce clarification requirements for missing provider, undefined attempt limit, unknown approval owner, or ambiguous false path.
- Do not create a clarification when the scope supplies the fact.
- Retrieval returns only relevant packs/manuals/patterns and stays within a configured size budget.
- UI renders clarification requirements without blocking saved existing workflows.

### 8. Expected user-visible behavior

Before or alongside analysis, users see a concise summary such as detected applications, decisions, collections, likely patterns, and specific missing facts. Clarification questions become more relevant and deterministic. Generated workflows remain unchanged because Qwen still uses the old prompt in K3.

### 9. Rollback risk

Low–Medium. Shadow mode prevents generation regressions. The visible summary can be hidden with a feature flag while retaining diagnostics.

### 10. Dependencies on earlier sprints

K1 planning/clarification contracts and K2 knowledge definitions.

---

## K4 — Grounded Qwen Planning Pipeline

### 1. Sprint title

Grounded Qwen Prompt and Planning Pipeline.

### 2. Exact objective

Use the K3 facts and retrieved K2 knowledge to build a compact, capability-constrained Qwen prompt. This is the first sprint that intentionally changes generated workflow behavior.

### 3. Existing files to modify

- `apps/server/src/services/analysis-service.ts`
- `apps/server/src/ai/prompts/workflow-analysis.ts`
- `apps/server/src/ai/providers/analysis-provider.ts`
- `apps/server/src/ai/providers/ollama-provider.ts`
- `apps/server/src/ai/providers/openai-provider.ts`
- `apps/server/src/ai/providers/local-provider.ts`
- `apps/server/src/config/environment.ts`
- `apps/server/src/services/analysis-service.test.ts`
- `apps/server/src/ai/providers/ollama-provider.test.ts`
- `packages/shared/src/domain.ts` — only additive provenance/context fields if approved.

### 4. New files to create

- `apps/server/src/analysis/workflow-planner.ts`
- `apps/server/src/analysis/planning-context-builder.ts`
- `apps/server/src/analysis/planning-context-builder.test.ts`
- `apps/server/src/analysis/workflow-planner.test.ts`
- `apps/server/src/ai/prompts/prompt-budget.ts`
- `apps/server/src/ai/prompts/prompt-budget.test.ts`

### 5. Public interfaces or schemas affected

- `AnalysisProviderInput` gains a structured planning context while retaining raw scope.
- Optional generation provenance may record prompt version, catalog version, retrieved knowledge IDs, and detector version.
- Canonical workflow JSON remains the output contract.

### 6. Data migration impact

No required workflow migration. Optional provenance fields must be additive with defaults. Existing projects remain readable.

### 7. Tests to add

- Prompt contains detected facts, relevant patterns, allowed operations, platform constraints, and hard rules.
- Prompt excludes unrelated application packs and full-manual dumps.
- Prompt stays within configured character/token budgets.
- Scope remains delimited as untrusted content.
- Generic node titles and unsupported operations are prohibited.
- Same scope under old/new feature flags can be compared.
- Ollama retry/model fallback behavior remains unchanged.
- Regression fixtures for simple and complex scopes produce valid canonical JSON.

### 8. Expected user-visible behavior

Generated workflows become more specific and structurally relevant: better retrieval steps, explicit decisions, appropriate loops/iterators, realistic application operations, and fewer generic nodes. Analysis may take slightly longer, but context remains compact.

### 9. Rollback risk

Medium. Prompt changes can alter local-model output substantially. Keep the current prompt behind a feature flag and record prompt/catalog versions for comparisons.

### 10. Dependencies on earlier sprints

K1 contracts, K2 catalog, and K3 facts/retrieval.

---

## K5 — Semantic Workflow Validation

### 1. Sprint title

Semantic Graph and Capability Validation.

### 2. Exact objective

Detect workflows that are schema-valid but logically or operationally invalid, without repairing them yet.

### 3. Existing files to modify

- `packages/shared/src/validation.ts`
- `packages/shared/src/graph.ts`
- `packages/shared/src/domain.ts`
- `packages/shared/src/index.ts`
- `apps/server/src/services/analysis-service.ts`
- `apps/client/src/features/editor/ValidationPanel.tsx`
- `apps/client/src/features/editor/NodeConfigurationPanel.tsx`
- `apps/client/src/styles.css`
- Existing validation, graph, compiler, adapter, and service tests

### 4. New files to create

- `packages/shared/src/semantic-validation.ts`
- `packages/shared/src/semantic-validation.test.ts`
- `packages/shared/src/cardinality-flow.ts`
- `packages/shared/src/cardinality-flow.test.ts`
- `packages/shared/src/control-flow-analysis.ts`
- `packages/shared/src/control-flow-analysis.test.ts`

### 5. Public interfaces or schemas affected

`WorkflowValidationIssue` expands with optional:

- `connectionId`
- `path`
- `details`
- `suggestedRepairId`
- `repairConfidence`
- `validatorVersion`

Canonical node configuration gains additive typed semantics for iterator, loop, route, delay, and aggregation where necessary.

### 6. Data migration impact

Additive schema defaults only. Existing categories map into new semantic checks through compatibility functions. Older workflows may receive new warnings but must not be rewritten automatically.

### 7. Tests to add

- Binary condition requires exactly two distinct primary business outcomes.
- Router supports multiple unique routes and an optional fallback.
- Iterator accepts collections and rejects single records.
- Collection feeding a single-item Google Sheets Add Row is invalid without iteration.
- Loop requires stop condition, boundary, and exit.
- Merge requires valid multiple incoming semantics.
- Aggregator requires multiple item results and a method.
- Delay requires duration/date/event and timezone when date-based.
- Unsupported application operations produce capability issues.
- Technical failures hidden from Business View do not invalidate Automation View.
- Existing legacy workflows generate compatibility warnings rather than crashes.

### 8. Expected user-visible behavior

The validation panel provides precise, actionable findings such as “This action accepts one item, but the previous step produces a collection” instead of broad warnings. Analysis can return “needs clarification” rather than persisting an invalid design.

### 9. Rollback risk

Medium. Stricter validation can block previously accepted workflows. Roll out new rules as warnings first, then promote proven rules to errors by validator version.

### 10. Dependencies on earlier sprints

K1 issue contracts, K2 operation capabilities, and preferably K4 grounded outputs for meaningful integration testing.

---

## K6 — Deterministic Repair and Targeted AI Repair

### 1. Sprint title

Bounded Semantic Repair with Transparent Reports.

### 2. Exact objective

Apply safe deterministic repairs for obvious issues, then ask Qwen to patch only ambiguous invalid fragments. Revalidate after every repair pass and never silently invent unresolved business rules.

### 3. Existing files to modify

- `apps/server/src/ai/repair/workflow-repair.ts`
- `apps/server/src/ai/repair/workflow-repair.test.ts`
- `apps/server/src/services/analysis-service.ts`
- `apps/server/src/ai/providers/analysis-provider.ts`
- `apps/server/src/ai/providers/ollama-provider.ts`
- `packages/shared/src/architecture-compiler.ts`
- `packages/shared/src/architecture-compiler.test.ts`
- `packages/shared/src/validation.ts`
- `apps/client/src/components/ScopeWorkspace.tsx`
- `apps/client/src/features/editor/ValidationPanel.tsx`

### 4. New files to create

- `packages/shared/src/semantic-repair.ts`
- `packages/shared/src/semantic-repair.test.ts`
- `apps/server/src/analysis/repair-orchestrator.ts`
- `apps/server/src/analysis/repair-orchestrator.test.ts`
- `apps/server/src/ai/prompts/workflow-repair.ts`
- `apps/server/src/ai/prompts/workflow-repair.test.ts`
- `apps/client/src/features/analysis/RepairSummary.tsx`

### 5. Public interfaces or schemas affected

- `RepairPlan`
- `RepairAction`
- `RepairResult`
- `RepairReport`
- `WorkflowPatch` for targeted node/edge operations
- `ClarificationRequirement` receives unresolved issue references
- `WorkflowAnalysisResult` gains optional repair summary/provenance

### 6. Data migration impact

No destructive migration. Repaired workflows are stored as new project versions. Existing versions remain restorable. Compiler behavior that currently invents missing endpoints must be deprecated gradually behind a compatibility flag.

### 7. Tests to add

- Remove iterator from a provably single-item path.
- Insert iterator before a single-item operation receiving a collection.
- Convert binary router to condition and 3+-outcome condition to router.
- Remove duplicate edges.
- Add safe terminal End nodes.
- Add a loop boundary only when the scope/pattern supplies the limit.
- Refuse automatic repair of ambiguous false branches and create a clarification.
- Targeted AI receives only invalid fragments, issues, and allowed capabilities.
- Maximum repair attempts are enforced.
- Repaired workflow is revalidated.
- Second deterministic pass is idempotent.
- Repair report lists every modification and confidence.

### 8. Expected user-visible behavior

Users see whether the workflow passed directly, was safely repaired, or needs clarification. Correct parts of a workflow are preserved instead of being discarded during full regeneration.

### 9. Rollback risk

High for logical correctness. A wrong repair can produce a plausible but incorrect workflow. Feature flags, confidence thresholds, immutable versions, repair previews, and strict revalidation are mandatory.

### 10. Dependencies on earlier sprints

K1 repair contracts, K2 capabilities, K3 clarification logic, K4 targeted provider context, and K5 semantic issue codes.

---

## K7 — Capability-Aware Platform Mapping

### 1. Sprint title

Capability-Aware Zapier, Make, and n8n Projection.

### 2. Exact objective

Replace broad category/string mapping with semantic mapping based on canonical function, application operation, branch behavior, cardinality, and target-platform capability. Preserve one canonical workflow across platforms.

### 3. Existing files to modify

- `packages/platforms/src/catalogs.ts`
- `packages/platforms/src/adapter.ts`
- `packages/platforms/src/index.ts`
- `packages/platforms/src/adapter.test.ts`
- `packages/platforms/src/comparison.ts`
- `packages/platforms/src/documentation.ts`
- `packages/shared/src/platform.ts`
- `packages/shared/src/index.ts`
- `apps/server/src/services/platform-service.ts`
- `apps/server/src/routes/platforms.ts`
- `apps/client/src/features/editor/NodeConfigurationPanel.tsx`
- `apps/client/src/features/editor/ComparisonExportPanel.tsx`

### 4. New files to create

- `packages/platforms/src/capability-resolver.ts`
- `packages/platforms/src/capability-resolver.test.ts`
- `packages/platforms/src/mapping-rules.ts`
- `packages/platforms/src/mapping-rules.test.ts`
- Optional platform-specific mapping fixture files under `packages/platforms/src/fixtures/`

### 5. Public interfaces or schemas affected

`PlatformNode` and `PlatformBuildPlan` gain:

- `canonicalFunctionId`
- `operationId`
- `mappingConfidence`
- `mappingStatus`
- `limitations`
- `alternatives`
- `catalogVersion`
- `implementationNotes`

### 6. Data migration impact

None for canonical workflow storage. Platform plans are derived on demand. Export snapshots may include mapping/catalog version for traceability.

### 7. Tests to add

- Zapier uses Filter only when false means stop; otherwise Paths.
- Make binary decisions use Router plus two filters.
- n8n uses IF for binary and Switch for multiple routes.
- Iterator and aggregator map separately.
- Unsupported operations expose limitations and alternatives.
- Low-confidence mappings never masquerade as native support.
- Changing platform does not alter canonical nodes or connections.
- Existing Asana/Gmail/Google Drive recommendation tests remain valid.

### 8. Expected user-visible behavior

Zapier, Make, and n8n plans become materially different and more credible. Node details clearly distinguish native support, workaround, limitation, and alternative implementation.

### 9. Rollback risk

Medium. Derived mapping can fall back to the current adapter version without changing stored workflows.

### 10. Dependencies on earlier sprints

K2 operation/platform catalog, K5 semantics, and K6 validated canonical workflows.

---

## K8 — Workflow Sets and True Layered Graph Views

### 1. Sprint title

Multiple Workflows per Project and Synchronized Graph Views.

### 2. Exact objective

Allow one scope/project to contain several independent canonical workflows, each with its own visual graph, validation, mapping, versions, and exports. Add genuine Business, Automation, and Developer graph projections from the same canonical records.

### 3. Existing files to modify

- `packages/shared/src/domain.ts`
- `packages/shared/src/api.ts`
- `packages/shared/src/graph.ts`
- `packages/shared/src/workflow-migration.ts`
- `packages/shared/src/index.ts`
- `apps/server/src/database/database.ts`
- `apps/server/src/repositories/project-repository.ts`
- `apps/server/src/services/project-service.ts`
- `apps/server/src/services/analysis-service.ts`
- `apps/server/src/routes/projects.ts`
- `apps/server/src/routes/analysis.ts`
- `apps/client/src/App.tsx`
- `apps/client/src/api/projects.ts`
- `apps/client/src/components/ScopeWorkspace.tsx`
- `apps/client/src/features/editor/WorkflowEditor.tsx`
- `apps/client/src/features/editor/editor-store.ts`
- `apps/client/src/features/editor/BusinessFlowView.tsx`
- `apps/client/src/features/editor/ImplementationNotesView.tsx`
- `apps/client/src/features/editor/ComparisonExportPanel.tsx`
- Related repository, service, graph, UI, and API tests

### 4. New files to create

- `packages/shared/src/workflow-set.ts`
- `packages/shared/src/workflow-set.test.ts`
- `packages/shared/src/view-projection.ts`
- `packages/shared/src/view-projection.test.ts`
- `apps/server/src/database/migrations/workflow-sets.ts` or an equivalent additive migration module
- `apps/client/src/features/editor/WorkflowSelector.tsx`
- `apps/client/src/features/editor/DeveloperFlowView.tsx`
- `apps/client/src/features/editor/DeveloperFlowView.test.tsx`

### 5. Public interfaces or schemas affected

- `Project.workflow` transitions toward `Project.workflowSet` with compatibility access during migration.
- `WorkflowSet`
- `WorkflowSummary`
- `WorkflowVisualGraphMap`
- `WorkflowViewMode`
- Node/edge visibility and concern metadata
- Project, analysis, editor-save, conversion, validation, and export request/response schemas become workflow-ID aware.

### 6. Data migration impact

High and additive:

- Wrap each existing canonical workflow in a one-item workflow set.
- Preserve project, workflow, node, connection, and version IDs.
- Key visual graphs by workflow ID.
- Retain legacy `workflow_json` and `visual_graph_json` during one compatibility version or create new workflow tables/JSON columns before cutover.
- Create a project version/snapshot before migration.
- Provide read fallback and migration idempotency.

### 7. Tests to add

- Existing single-workflow projects migrate without ID or layout loss.
- Migration can run twice safely.
- Five requested Asana automations produce five independent workflows.
- Switching workflows preserves unsaved/saved editor state correctly.
- Validation and platform conversion target the selected workflow only.
- Business View contracts technical nodes without breaking route meaning.
- Automation View shows realistic operational topology.
- Developer View shows retries, logging, idempotency, and technical errors.
- Exports name and scope each workflow correctly.
- Restore/version behavior remains correct after migration.

### 8. Expected user-visible behavior

Users can select independent automations within one project instead of receiving one oversized graph. Business, Automation, and Developer views all preserve correct branching while showing the appropriate level of detail.

### 9. Rollback risk

Very high—the highest overall regression risk—because persistence, APIs, editor state, analysis, exports, and every workflow consumer change. Rollback requires retained legacy data, additive migration, pre-migration versions, and a compatibility adapter.

### 10. Dependencies on earlier sprints

K1 workflow-set preview contracts, K4 generation context, K5 validation per graph, K6 repair per graph, and K7 mapping per graph. It should not begin before those contracts are stable.

---

## K9 — Branch-Aware Layout, Real Progress, Performance, and Hardening

### 1. Sprint title

Large-Workflow Readability and Operational Hardening.

### 2. Exact objective

Make 20–40-node workflows readable and provide truthful pipeline progress, cancellation, diagnostics, and performance safeguards for local Qwen execution.

### 3. Existing files to modify

- `packages/shared/src/graph.ts`
- `apps/server/src/routes/analysis.ts`
- `apps/server/src/services/analysis-service.ts`
- `apps/server/src/ai/providers/ollama-provider.ts`
- `apps/server/src/app.ts`
- `apps/client/src/components/ScopeWorkspace.tsx`
- `apps/client/src/features/editor/WorkflowEditor.tsx`
- `apps/client/src/features/editor/editor-store.ts`
- `apps/client/src/features/editor/WorkflowCanvasNode.tsx`
- `apps/client/src/styles.css`
- `apps/client/src/api/projects.ts`

### 4. New files to create

- `packages/shared/src/branch-layout.ts`
- `packages/shared/src/branch-layout.test.ts`
- `apps/server/src/analysis/progress-reporter.ts`
- `apps/server/src/analysis/progress-reporter.test.ts`
- `apps/server/src/routes/analysis-progress.ts`
- `apps/client/src/features/analysis/AnalysisProgress.tsx`
- Large-workflow performance fixtures and integration tests

### 5. Public interfaces or schemas affected

- `AnalysisProgressEvent` becomes an active streaming/polling contract.
- Analysis jobs gain job ID, state, cancellation status, start/end timestamps, and stage details.
- Layout results may gain route groups, ranks, loop bounds, and stable layout version metadata.

### 6. Data migration impact

Low. Layout metadata is derived or optional. Analysis job state should be transient initially. Persisted visual positions remain compatible.

### 7. Tests to add

- Stable non-overlapping 20-node and 40-node layouts.
- Separate branch lanes and readable convergence.
- Loop-back edges do not cross primary flow unnecessarily.
- Layout remains deterministic for the same graph/version.
- Progress events arrive in valid order and terminate correctly.
- Cancellation stops pending work safely.
- Ollama queue remains serialized and releases after failures/timeouts.
- Retrieval caches invalidate by catalog version.
- Full K1–K8 regression suite and end-to-end Asana multi-workflow scenario.

### 8. Expected user-visible behavior

Large workflows remain navigable, branches are easier to follow, progress reflects real server stages, and users can cancel long analysis instead of waiting for a fabricated percentage.

### 9. Rollback risk

Medium. Existing Dagre layout and estimated progress remain fallbacks. No canonical workflow data needs conversion.

### 10. Dependencies on earlier sprints

All earlier contracts, especially K1 progress stages, K5 semantic branch data, and K8 workflow/view selection.

---

## Milestone identification

| Question | Sprint |
|---|---|
| First changes Qwen prompt or generation behavior | **K4 — Grounded Qwen Planning Pipeline** |
| Introduces the knowledge catalog | **K2 — Canonical Knowledge Catalog and Application Operation Packs** |
| Introduces deterministic clarification requests | **K3 — Deterministic Scope Facts, Pattern Matching, Retrieval, and Clarifications**. K1 defines the schema only. |
| Adds semantic validation | **K5 — Semantic Workflow Validation** |
| Adds targeted repair | **K6 — Deterministic Repair and Targeted AI Repair** |
| Introduces persisted workflow sets | **K8 — Workflow Sets and True Layered Graph Views**. K1 defines only a preview contract. |
| Highest overall regression risk | **K8**, because it changes persistence, APIs, editor state, views, and exports. K6 has the highest business-logic correctness risk. |

## Safest first sprint producing a visible improvement

The implementation sequence must still begin with **K1**, because later work needs stable contracts, but K1 is intentionally invisible.

The safest first **user-visible** sprint is **K3** after K1 and K2 are complete. K3 can show:

- detected applications
- detected decisions and routes
- single-item versus collection assumptions
- likely workflow patterns
- precise clarification requirements

It should initially run in shadow mode and must not change Qwen’s prompt. That makes the improvement immediately reviewable while avoiding workflow-set migration, canonical graph changes, model-output regressions, or automatic repair risk.

Recommended rollout:

1. Implement K1 as a compatibility-only foundation.
2. Implement K2 as a non-invasive knowledge package.
3. Release K3’s detected-process and clarification summary as the first visible improvement.
4. Review K3 results against real user scopes before authorizing K4 generation changes.
