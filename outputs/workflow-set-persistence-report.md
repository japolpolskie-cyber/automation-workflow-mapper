# Workflow-Set Persistence Delivery Report

## Architecture summary

The project now persists multiple workflows as first-class project entities while retaining one canonical workflow graph as the only source of truth for nodes and edges.

`WorkflowSet` is a versioned ownership index containing workflow metadata and two reference collections:

- `nodeReferences`
- `connectionReferences`

Every reference has one `owningWorkflowId` and zero or more `referencedByWorkflowIds`. This supports shared nodes and edges without duplicating canonical resources. The project contract validates unique workflow IDs, unique resource references, valid ownership targets, and complete coverage of every canonical node and connection.

The planner, prompts, workflow intelligence, Stage C, and Stage D were not modified.

## Persistent workflow metadata

Each workflow entry stores:

- ID
- name
- description
- trigger summary
- platform summary
- readiness
- status
- applications
- creation timestamp
- update timestamp

## Save, load, switching, and export

- New projects receive one empty default workflow set.
- A first or fully regenerated analyzed graph is partitioned by disconnected graph components and persisted.
- Subsequent edits reconcile resource ownership, remove stale references, and assign new resources to the active workflow.
- The editor selector reads persisted workflow entries and ownership references rather than deriving tabs in the client.
- Shared resources appear in each explicitly referencing workflow while remaining one canonical node or edge.
- Editor save includes the workflow set.
- Legacy editor payloads without a workflow set remain accepted.
- JSON exports include the selected workflow ID and complete workflow set.

## Backward compatibility and migration strategy

The SQLite migration is additive:

```sql
ALTER TABLE projects ADD COLUMN workflow_set_json TEXT;
```

The column is nullable. Existing rows remain valid and unchanged. When an older row has no workflow-set JSON, loading synthesizes one default workflow using the canonical workflow ID and references every existing node and connection. The synthesized set is persisted on the next normal workflow save; no destructive or eager data rewrite is required.

Existing canonical workflow JSON, visual graph JSON, version snapshots, project IDs, node IDs, connection IDs, API routes, and legacy editor save payloads remain compatible.

## Files changed

### Created

- `packages/shared/src/workflow-set.ts`
- `packages/shared/src/workflow-set.test.ts`
- `apps/server/src/repositories/project-repository.test.ts`
- `outputs/workflow-set-persistence-report.md`

### Modified

- `packages/shared/src/domain.ts`
- `packages/shared/src/index.ts`
- `apps/server/src/database/database.ts`
- `apps/server/src/repositories/project-repository.ts`
- `apps/server/src/services/project-service.ts`
- `apps/server/src/app.test.ts`
- `apps/client/src/api/projects.ts`
- `apps/client/src/components/ScopeWorkspace.test.tsx`
- `apps/client/src/features/editor/workflow-product.ts`
- `apps/client/src/features/editor/workflow-product.test.ts`
- `apps/client/src/features/editor/WorkflowEditor.tsx`
- `apps/client/src/features/editor/ComparisonExportPanel.tsx`
- `README.md`

## Verification

- Lint: passed.
- Type-check: passed.
- Tests: 249 passed; 4 existing opt-in live-model tests skipped.
- Production build: passed for shared, knowledge, platforms, server, and client.
- Existing planner, Stage C, and Stage D regression suites: passed.
- Existing legacy editor payload test: passed without a workflow-set field.
- Build advisory: the existing client bundle remains above Vite's 500 kB advisory threshold.

## Known limitations

- Workflow creation and membership editing are currently driven by analysis and editor reconciliation; a dedicated workflow-set management screen is not included.
- Automatic initial partitioning uses disconnected canonical graph components. Intentionally shared resources must be represented through explicit references.
- Platform readiness metadata is advisory and updates through normal editor save.

## Recommended commit

`feat(workflows): persist project workflow sets and shared ownership`
