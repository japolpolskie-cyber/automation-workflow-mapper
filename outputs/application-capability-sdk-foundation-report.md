# Application Capability SDK Foundation — Delivery Report

## Completion

The approved SDK foundation is complete on `feature/application-capability-sdk`.

Implemented:

- typed, versioned capability-pack contracts;
- strict schemas and semantic validation;
- immutable pack builder;
- deterministic application, alias, operation, mapping, and query registry;
- build-time manifest generation and stale-manifest enforcement;
- knowledge compatibility adapter;
- compatibility-only fixtures;
- authoring and dependency documentation.

The generated manifest contains zero capability packs. Shopify was not registered, and existing application packs were not migrated.

## Files created

- `packages/capability-sdk/package.json`
- `packages/capability-sdk/tsconfig.json`
- `packages/capability-sdk/src/contracts.ts`
- `packages/capability-sdk/src/schemas.ts`
- `packages/capability-sdk/src/validation.ts`
- `packages/capability-sdk/src/builders.ts`
- `packages/capability-sdk/src/fixtures.ts`
- `packages/capability-sdk/src/index.ts`
- `packages/capability-sdk/src/validation.test.ts`
- `packages/capability-registry/package.json`
- `packages/capability-registry/tsconfig.json`
- `packages/capability-registry/src/generated-manifest.ts`
- `packages/capability-registry/src/registry.ts`
- `packages/capability-registry/src/index.ts`
- `packages/capability-registry/src/registry.test.ts`
- `packages/knowledge/src/sdk-compatibility.ts`
- `packages/knowledge/src/sdk-compatibility.test.ts`
- `scripts/generate-capability-manifest.mjs`
- `docs/application-capability-sdk.md`
- `outputs/application-capability-sdk-foundation-report.md`

## Files modified

- `package.json`
- `package-lock.json`
- `packages/knowledge/package.json`
- `packages/knowledge/src/application-packs.ts`
- `packages/knowledge/src/index.ts`

## Compatibility

- Existing `ApplicationPack`, `OperationDefinition`, and `KnowledgeCatalog` interfaces remain available.
- Existing seven knowledge packs remain unchanged and are still the only registered application packs.
- The SDK compatibility adapter maps future packs into current knowledge contracts.
- An explicit regression test proves that an empty generated manifest leaves the current knowledge catalog unchanged.
- `packages/shared` remains independent of SDK, registry, and knowledge packages.

## Validation gates

The SDK rejects:

- invalid schemas and identifiers;
- duplicate operations, limitations, or documentation IDs;
- invalid internal references;
- contradictory batch/cardinality declarations;
- unknown or unsupported mappings without explicit limitations;
- unsupported mappings without alternatives;
- native mappings without verified, dated source evidence;
- unknown mappings presented as verified.

The registry rejects pack-ID, application-alias, and operation collisions and returns deterministically sorted query results.

## Manifest generation

`npm run capabilities:generate` creates the sorted static manifest from explicitly opted-in workspace packages.

`npm run capabilities:check` verifies the manifest is current. Production builds run this check automatically.

Runtime filesystem scanning and arbitrary plugin execution are not used.

## Verification

- Manifest integrity: passed; zero packs registered.
- Lint: passed.
- Type-check: passed.
- Tests: 256 passed; 4 existing opt-in live-model tests skipped.
- Production build: passed.
- Existing planner, compiler, Stage C, Stage D, workflow persistence, and UI regression suites: passed.
- Existing Vite large-bundle advisory remains non-blocking.

## Scope verification

Not modified:

- planner;
- deterministic compiler;
- Stage C;
- Stage D;
- Qwen or other prompts;
- database;
- workflow persistence;
- existing capability-pack definitions.

Shopify was not added or registered.

## Recommended commit

`feat(capabilities): add application capability SDK foundation`
