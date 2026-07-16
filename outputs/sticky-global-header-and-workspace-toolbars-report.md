# Sticky Global Header and Workspace Toolbars

## Status

Implementation complete. Automated verification passes. The requested live scrolled screenshot could not be captured because the in-app browser control interface was unavailable in this session.

## Implementation

- Added shared layout variables:
  - `--global-header-height`
  - `--workspace-toolbar-height`
  - `--sticky-global-z`
  - `--sticky-workspace-z`
- Made the dashboard, scope workspace, and workflow-editor headers sticky.
- Kept the dashboard header aligned with the existing sticky sidebar.
- Made compact analysis status, Analyze action, analysis result header, Detected Process Summary header, and validation/regenerate footer sticky.
- Preserved the existing fixed workflow-editor layout, view selector, platform selector, auto-layout control, validation panel, and canvas fit/zoom controls.
- Kept the React Flow canvas independently pannable and zoomable.
- Added `scroll-margin-top` for validation targets, clarifications, errors, and anchored content.
- Used CSS only; no scroll listeners or motion were introduced.
- Tablet layouts reduce secondary editor actions to compact icon controls.
- Mobile disables nested sticky bars and retains only one compact global header.

## Files changed

- `apps/client/src/App.tsx`
- `apps/client/src/App.test.tsx`
- `apps/client/src/components/ScopeWorkspace.tsx`
- `apps/client/src/components/ScopeWorkspace.test.tsx`
- `apps/client/src/components/DetectedProcessSummary.tsx`
- `apps/client/src/components/DetectedProcessSummary.test.tsx`
- `apps/client/src/features/editor/WorkflowEditor.tsx`
- `apps/client/src/styles.css`
- `outputs/sticky-global-header-and-workspace-toolbars-report.md`

## Verification

- Client tests: 4 passed.
- Lint: passed.
- Client type-check: passed.
- Client production build: passed.
- Existing advisory remains: the main client bundle exceeds Vite's 500 kB advisory threshold.
- No planner, workflow generation, topology, grounding, backend, database, persistence, or Qwen code changed.
- K5 has not started.

## Screenshot

Not captured. The Browser skill was available and its required instructions were followed, but its required in-app browser execution interface was not exposed in this session. A mock or unrelated screenshot was intentionally not substituted.

## Recommended commit message

`feat(ui): add sticky global header and workspace toolbars`

