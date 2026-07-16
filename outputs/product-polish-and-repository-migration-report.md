# Product Polish and Repository Migration Report

## Completion

The product-polish scope is implemented as additive client projections. Independent trigger chains appear as workflow cards across Business, Automation, Developer, and Handoff views. Readiness, node status, semantic edge labels, platform badges, and a client handoff panel are visible without changing the canonical workflow, planner behavior, database schema, or persisted data.

## Recommended permanent structure

```text
automation-workflow-mapper/
  apps/
    client/
    server/
  packages/
    shared/
    knowledge/
    platforms/
  docs/
  outputs/
  public/                 # create when shared static assets are introduced
  scripts/                # create for repeatable maintenance tasks only
  tests/                  # create for cross-package/end-to-end suites
  .env.example
  .gitignore
  eslint.config.js
  package.json
  package-lock.json
  README.md
  LICENSE                 # add after a license is selected
  tsconfig.base.json
```

Empty directories should not be created merely to match this proposal. Add `public`, `scripts`, and top-level `tests` when they have owned content.

## Required files to copy

Copy the following complete source sets:

- Root: `.env.example`, `.gitignore`, `eslint.config.js`, `package.json`, `package-lock.json`, `README.md`, `tsconfig.base.json`.
- Client configuration: `apps/client/index.html`, `apps/client/package.json`, `apps/client/tsconfig.json`, `apps/client/tsconfig.app.json`, `apps/client/tsconfig.node.json`, `apps/client/vite.config.ts`.
- Client source: every file under `apps/client/src/`, including `api/`, `components/`, `features/editor/`, tests, `App.tsx`, `main.tsx`, and `styles.css`.
- Server configuration: `apps/server/package.json`, `apps/server/tsconfig.json`.
- Server source: every file under `apps/server/src/`, including `ai/`, `analysis/`, `config/`, `database/`, `distributed-planner/`, `documents/`, `planner/`, `repositories/`, `routes/`, `services/`, tests, `app.ts`, and `index.ts`.
- Shared package: `packages/shared/package.json`, `packages/shared/tsconfig.json`, and every file under `packages/shared/src/`.
- Knowledge package: `packages/knowledge/package.json`, `packages/knowledge/tsconfig.json`, and every file under `packages/knowledge/src/`.
- Platform package: `packages/platforms/package.json`, `packages/platforms/tsconfig.json`, and every file under `packages/platforms/src/`.
- Maintained documentation: every file under `docs/`.
- Approved milestone evidence: Markdown reports under `outputs/`. Keep screenshots only when they remain useful acceptance evidence.

This directory-based inventory is deliberate: it includes every source and test file in the listed directories while avoiding a brittle hand-maintained filename list.

## Generated and local files

Review before copying:

- `outputs/*.md`: milestone, benchmark, and acceptance reports; retain approved evidence.
- `outputs/*.png`: generated screenshots; retain only referenced acceptance evidence.
- `apps/*/dist/`, `packages/*/dist/`: generated builds; regenerate.
- `coverage/`: generated test coverage; regenerate.
- `*.tsbuildinfo`: generated TypeScript incremental state; regenerate.
- `data/*.db`, `*.db-shm`, `*.db-wal`: local runtime data; back up separately if needed, never commit.
- `*.log`: local logs; discard unless required for a defect record.
- planner/stage caches and benchmark artifacts: discard unless an approved report depends on them.

## Temporary workspace content that must not be copied

- `node_modules/`
- `.env` and any file containing API keys
- `.codex/`, `.agents/`, editor/session metadata, attachment copies, and temporary prompt files
- `dist/`, `coverage/`, `*.tsbuildinfo`, caches, and logs
- local SQLite database files and journals
- unreferenced screenshots and ad-hoc exports
- any temporary Git metadata belonging to the Codex workspace

## Migration checklist

1. Close the development servers and create a backup of any local database needed for reference.
2. Create `C:\Users\japol\Projects\automation-workflow-mapper`.
3. Copy only the required files and approved evidence described above.
4. Confirm that `.env`, credentials, databases, caches, build folders, and Codex metadata are absent.
5. Create `.env` from `.env.example` in the new directory and enter secrets locally.
6. Run `npm install`.
7. Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
8. Start with `npm run dev`; verify client, API health, local model status, project creation, analysis, all four workflow views, save, and export.
9. Compare source-file counts between the temporary and permanent `apps/*/src` and `packages/*/src` directories.
10. Initialize Git only after verification succeeds.

## Repository initialization

Run inside the verified permanent directory:

```powershell
git init
git add .
git commit -m "chore: establish automation workflow mapper repository"
git branch -M main
git remote add origin https://github.com/<owner>/automation-workflow-mapper.git
git push -u origin main
```

Recommended branches:

- protected `main`, always releasable;
- short-lived `feature/<name>` and `fix/<name>` branches;
- pull requests with lint, type-check, tests, and build required;
- avoid long-running architecture branches.

Recommended tags:

- `v0.1.0-foundation` after the migrated baseline is verified;
- semantic release tags (`v0.2.0`, `v0.2.1`) for later product milestones.

The existing `.gitignore` correctly excludes dependencies, builds, coverage, `.env`, databases, macOS metadata, and logs. Add these entries during migration:

```gitignore
*.tsbuildinfo
.codex/
.agents/
.cache/
tmp/
```

## Migration and rollback safety

Do not delete or modify the temporary workspace during migration. If verification fails, remove only the newly created permanent directory after confirming its absolute path is exactly within `C:\Users\japol\Projects`, correct the copy list, and repeat. The current workspace remains the rollback source until the new repository has passed all checks and its first commit is pushed.

## Known limitations

- UI workflow cards are derived from independent trigger/root-connected components; they are not persisted workflow sets.
- Shared or intentionally cross-workflow nodes may require a future explicit workflow-set model.
- Readiness and effort are deterministic advisory projections, not delivery estimates or planner instructions.
- Platform badges reflect current adapter knowledge and do not prove live credential or account availability.
- No migration was performed by this sprint.

## Verification record

- Lint: passed.
- Full workspace type-check: passed.
- Tests: 243 passed, 4 live-model tests skipped by their existing opt-in controls.
- Production build: passed across shared, knowledge, platforms, server, and client.
- Client build: passed; Vite reported the existing large-chunk advisory for the main bundle.
- Planner behavior: unchanged; no server, planner, analysis, knowledge, platform, prompt, Stage C, or Stage D source was modified.
- Workflow generation: unchanged.
- Database and persisted workflow contracts: unchanged.
