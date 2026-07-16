# K2 Delivery Report — Canonical Knowledge Catalog

Date: 2026-07-16  
Status: K2 complete; K3 not started

## Architecture summary

K2 introduces a new `@awm/knowledge` workspace package containing a typed, versioned, queryable catalog. The package depends on `@awm/shared` for platform and cardinality contracts. `@awm/shared` does not import or depend on knowledge.

The catalog is additive and currently runs outside the production generation path. Qwen prompts, provider inputs, workflow generation, compiler behavior, platform adapter behavior, API contracts, database schema, and stored workflow schemas are unchanged.

The package contains three layers:

```text
Canonical function registry
  ↓ references
Platform capability definitions
  ↑ referenced by
Application operation packs
```

Existing `applicationRegistry` data is reused to carry forward established application names and aliases. Existing platform catalogs remain active and unchanged; K2’s capability definitions prepare a typed compatibility layer for K7 rather than replacing the adapters early.

## Exact files created

- `packages/knowledge/package.json`
- `packages/knowledge/tsconfig.json`
- `packages/knowledge/src/types.ts`
- `packages/knowledge/src/canonical-registry.ts`
- `packages/knowledge/src/platform-capabilities.ts`
- `packages/knowledge/src/application-packs.ts`
- `packages/knowledge/src/index.ts`
- `packages/knowledge/src/catalog-integrity.test.ts`
- `packages/knowledge/src/asana-crm-benchmark.test.ts`

## Exact files modified

- `package.json` — adds knowledge type-check, test, and build to the root release sequence.
- `package-lock.json` — registers the local `@awm/knowledge` workspace package.

No shared, platform, server, client, prompt, provider, database, or workflow-domain source file was modified by K2.

## Catalog structure

### Public catalog entry point

`knowledgeCatalog` exposes:

- `version`
- `canonicalFunctions`
- `applications`
- `platformCapabilities`
- `getCanonicalFunction(id)`
- `getApplication(applicationIdOrAlias)`
- `getOperation(applicationIdOrAlias, operationId)`

### Version

Catalog version: `1.0.0`

Every canonical definition, platform capability, application pack, and operation carries this version.

### Core types

- `CanonicalFunctionId`
- `CanonicalFunctionDefinition`
- `CompatibilityRule`
- `KnowledgeFieldDefinition`
- `PlatformCapabilityDefinition`
- `OperationPlatformMapping`
- `OperationDefinition`
- `ApplicationPack`
- `KnowledgeCatalog`

## Registered canonical functions

Twenty canonical functions are registered:

1. Trigger
2. Action
3. Data Retrieval
4. Data Transformation
5. Validation
6. Filter
7. Binary Condition
8. Multi-Route Decision
9. Iterator
10. Loop
11. Merge
12. Aggregator
13. Delay / Wait
14. Human Approval
15. Retry
16. Error Handler
17. Notification
18. Logging
19. Manual Review
20. End

Every definition contains:

- Stable ID and canonical type
- Purpose
- Use and do-not-use guidance
- Required inputs and outputs
- Accepted cardinality
- Compatibility rules
- Common previous and next functions
- Common mistakes
- Three platform capability references
- Catalog version

Key encoded semantics include:

- Iterator accepts collections and forbids single-record input.
- Binary Condition requires exactly two meaningful outcomes.
- Multi-Route Decision represents three or more routes.
- Filter requires unmatched records to stop without business actions.
- Loop and Retry require finite boundaries.
- Merge requires multiple incoming branches.
- Aggregator requires multiple item results.
- Delay requires duration, date, or resume event.
- Human Approval requires approval, rejection, and no-response handling.

## Platform capability catalog

Sixty capability definitions are registered: 20 canonical functions × n8n, Make, and Zapier.

Each includes:

- Stable capability ID
- Platform
- Canonical function ID
- Recommended implementation
- Native/workaround/unsupported status
- Explicit limitation where equivalence is incomplete
- Alternative where appropriate

Examples:

- n8n Binary Condition → IF
- Make Binary Condition → Router with two filters, marked as a workaround
- Zapier Filter → Filter by Zapier
- Zapier Binary Condition → Paths, with guidance to use Filter only for stop-on-false behavior
- Make Merge → route convergence with limitations
- Zapier Aggregator → Formatter/Digest/Code/Storage workaround
- Cross-platform Manual Review → external queue/interface workaround

## Registered application operations

Seven application packs and 25 operations are registered.

### Asana — 6 operations

- Task Moved to Section
- Retrieve Task Details
- Find Subtask
- Create Subtask
- Update Subtask
- Update Task

### Google Drive — 3 operations

- Find Folder
- Create Folder
- Upload File

### Google Sheets — 3 operations

- Add Row
- Append Multiple Rows via Sheets API
- Lookup Row

### Gmail — 3 operations

- New Email
- Send Email
- Search Email

### Slack — 3 operations

- New Message
- Send Channel Message
- Send Direct Message

### Webhook / Generic API — 3 operations

- Receive Webhook
- Send HTTP Request
- Retrieve Paginated Records

### Generic CRM — 4 operations

- Find CRM Record
- Create CRM Record
- Update CRM Record
- Create or Update CRM Record

Every operation declares required inputs, outputs, accepted input cardinality, produced output cardinality, batch support, common adjacent functions, mistakes, platform mappings, limitations, alternatives, and catalog version.

## Dependency verification

Required direction:

```text
@awm/knowledge → @awm/shared
```

Forbidden direction:

```text
@awm/shared → @awm/knowledge
```

Verification results:

- Knowledge package declares `@awm/shared` as a dependency.
- Shared package declares no knowledge dependency.
- Shared source contains no `@awm/knowledge` or `packages/knowledge` import/reference.
- An automated integrity test enforces this rule.
- Platform adapters do not depend on knowledge yet, preventing premature K7 integration.

## Real-world Asana CRM benchmark

The catalog benchmark confirms it can represent:

- Asana task moved to section
- Retrieve Asana task details
- Search and create a Google Drive folder
- Search, create, and update an Asana subtask
- Send a Gmail follow-up
- Log one result as one Google Sheets row
- Binary lead-response decision with exactly two outcomes
- Service-based multi-route decision with three or more routes
- Iterator collection semantics
- Merge versus Aggregator semantics
- Filter stop-on-unmatched semantics
- Single-row versus batch-row cardinality
- Explicit Zapier limitation for native multi-row batch append

Important benchmark results:

- Google Sheets Add Row: input `single`, output `single`, batch support `false`.
- Google Sheets Append Multiple Rows API: input `collection`, batch support `true`.
- Zapier mapping for explicit batch append: `unsupported`, with a limitation and alternatives using Looping/Add Row or Webhooks/API.
- Iterator: collection-only.
- Binary Condition: exactly two outcomes.
- Multi-Route Decision: three or more outcomes.

During the first integrity run, the benchmark detected that Paginated Retrieval had been marked batch-capable even though it accepts one request configuration and produces a collection. The flag was corrected to `false`, demonstrating that input cardinality and output cardinality are being validated independently.

## Complete test results

- Lint: passed
- Full workspace type-check: passed
- Shared tests: 25 passed
- Knowledge tests: 8 passed
- Platform tests: 8 passed
- Server tests: 27 passed
- Client tests: 2 passed
- Total: **70 passed, 0 failed**
- Full production build: passed

The existing client bundle-size warning remains and predates K2.

## Backward-compatibility report

- Qwen system and user prompts unchanged.
- Analysis provider inputs unchanged.
- Workflow generation output unchanged.
- Local deterministic fallback unchanged.
- Architecture compiler unchanged.
- Workflow validation unchanged.
- Application registry public imports unchanged.
- Platform catalog and adapter behavior unchanged.
- Database and persisted workflow schemas unchanged.
- API request and response contracts unchanged.
- Client and UI unchanged.
- Existing application aliases remain resolvable.
- All existing tests pass without behavioral updates.
- No data migration required.
- No breaking changes.
- No screenshots required because K2 has no UI changes.

## Newly discovered risks

1. **Catalog governance:** Connector capabilities change over time. Catalog versions and evidence/source metadata will eventually be needed for updates.
2. **Scoped operation identity:** K2 currently enforces globally unique operation IDs as required. As the catalog grows, compound identity (`applicationId.operationId`) is more scalable and may permit common operation names without collisions.
3. **Native-support precision:** Even common operations vary by connector version and account plan. Exact event operations use `workaround`, `unknown`, or limitation fields where certainty is insufficient.
4. **Alias collisions:** Generic aliases such as “CRM” or “spreadsheet” must remain exact query aliases until K3 introduces scored detection; substring matching would over-select packs.
5. **Duplication window:** Existing platform catalogs and the new knowledge catalog temporarily describe related concepts. This is deliberate for backward compatibility but must be reconciled through adapters in K7 rather than maintained indefinitely as independent truths.
6. **Catalog size:** K3 must retrieve only relevant definitions. Sending the full K2 catalog to Qwen would violate the architecture and hurt local performance.

## Git status concern

The requested K1 commit could not be created because the visible `.git` directories contain no Git metadata (`HEAD`, index, history, or configuration). Initializing a new repository and committing only K1 would create a broken root commit that excludes the existing application; committing everything would mislabel years/sprints of prior work as K1.

No Git repository was initialized automatically. A repository baseline decision is required before safe commits can be created.

## Recommended K2 Git commit message

`feat(knowledge): add canonical function and application operation catalogs`

## Stop condition

K2 is complete and releasable. K3 has not started and requires explicit approval.
