# Architecture and delivery plan

## Model boundaries

1. **Generic workflow domain model** — canonical nodes, connections, mappings, actors, systems, assumptions, and risks.
2. **Visual graph model** — layout and selection metadata referencing domain IDs; never the sole source of truth.
3. **Platform model** — adapter-owned Zapier, Make, or n8n terminology and constraints.
4. **AI analysis result** — a future strict schema containing extracted evidence, confidence, questions, and a candidate workflow.
5. **Export model** — format-specific, immutable render input assembled from a validated domain workflow.

## Platform adapter contract

Each adapter declares its platform and catalog, transforms a canonical workflow, validates its platform representation, and estimates relative usage. Catalogs and rules will live under `packages/platforms/{zapier,make,n8n}` in Sprint 6. Keeping conversion one-way from the canonical model prevents vendor rules from leaking into analysis.

## Database schema

### projects

`id`, name, client name, description, platform, status, original scope, canonical workflow JSON, created and updated timestamps. Platform and status use check constraints; indexed by platform and update time.

### project_versions

Immutable project snapshots keyed by project and monotonic version number. Event type records why a version exists. A unique constraint prevents duplicate numbers.

### audit_events

Request-correlated audit placeholder with actor, action, resource, sanitized metadata, and timestamp. Authentication will supply actor IDs later. Credentials will be references to an external secret manager, never plaintext fields.

PostgreSQL production migrations should replace JSON text with `jsonb`, retain constraints, and add tenant IDs before multi-user release.

## API contract

All endpoints return `{ success, data, error, meta: { requestId } }`. Sprint 1 implements:

| Method | Route | Result |
|---|---|---|
| GET | `/api/health` | Service readiness |
| GET | `/api/workflows` | Projects by most recent update |
| POST | `/api/workflows` | Validate and create a project |
| GET | `/api/workflows/:id` | Fetch one project or typed 404 |
| PATCH | `/api/workflows/:id/scope` | Persist reviewed scope text and create a version |
| POST | `/api/documents/extract` | Validate one multipart document and return reviewable text |

Planned contracts retain the requested routes for document extraction, analyze, generate, validate, convert, assist, patch/delete, versions, restore, and export. Mutations will use strict Zod bodies and optimistic concurrency via version/ETag.

## Sprint plan

1. **Foundation (implemented):** workspace, strict TypeScript, environment checks, canonical schema, platform interface, database, health API, project dashboard/create flow, security baseline, tests.
2. **Document processing (implemented):** safe upload envelope, MIME/signature checks, pluggable extractors, editable preview, scope persistence.
3. **Generic workflow domain (implemented):** richer graph invariants, fixtures, mappings, validation types, visual projection.
4. **AI analysis (implemented):** provider abstraction, isolated prompts, evidence-aware extraction, JSON repair, strict validation, clarification questions, persistence.

### Provider policy

`local` is a deterministic, no-model preview. `ollama` uses the native local `/api/chat` endpoint with a JSON schema and an ordered list of installed models; failures move only to the next configured local model. `openai` uses the hosted Responses API. There is no automatic local-to-cloud failover, preventing unexpected billing or scope content leaving the machine.
5. **Visual builder:** React Flow projection, Zustand commands, history, palette, configuration panel, persistence.
6. **Platform adapters:** catalogs, mapping and validation for Zapier, Make, and n8n.
7. **Validation:** deterministic topology, input, credential, risk, complexity, and consumption checks.
8. **Assistant:** schema-bound proposed patches with preview, accept/reject, and audit history.
9. **Comparison/export:** relative comparison plus verified image, JSON, Markdown, PDF, checklist, and handoff exports.
10. **Hardening:** accessibility, performance, security tests, PostgreSQL, auth/tenancy, operations documentation.

## Sprint 1 file inventory

- Root workspace: `package.json`, TypeScript/ESLint configuration, environment example, README.
- Shared: domain schemas/types, API envelope, platform adapter interfaces, schema tests.
- Server: configuration, database bootstrap, repository, service, health/project routes, application factory, API tests.
- Client: Vite setup, dashboard, project dialog, platform marks, typed API client, responsive design, UI test.

## Long-term tradeoffs

Storing the canonical workflow as JSON makes schema evolution and snapshots easy, while analytics across node properties are harder; PostgreSQL JSONB indexes or derived tables can address that later. A REST API is simple and cacheable, while complex collaborative canvas updates may eventually benefit from WebSockets. SQLite is excellent for the local Sprint 1 experience but not the production concurrency target.

## Automation Architect compiler

The analysis boundary now follows `AI draft -> schema repair -> v1/v2 migration -> deterministic architecture compiler -> topology validation -> persistence`. The compiler is provider-independent, so local Ollama and hosted providers receive the same structural safeguards. It adds explicit decision exits, convergence merges, external-operation failure routes, controlled retry guidance, notifications, manual review, and completion nodes where the draft is incomplete.

Canvas nodes, the configuration sidebar, business flow, implementation notes, validation, and exports are projections of the same canonical node records. React Flow node data stores the canonical node rather than independent label/application/operation copies. Platform plans remain translations of canonical applications and operations, not competing workflow definitions.

Schema v1 remains readable. `migrateWorkflow()` fills new metadata and upgrades the in-memory document to v2 while preserving workflow, node, and connection IDs. The next project mutation persists the upgraded representation and the existing project-version mechanism retains prior snapshots.
