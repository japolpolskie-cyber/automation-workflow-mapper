# Application Capability SDK

The Application Capability SDK is the supported extension boundary for future application catalogs. It allows independently maintained, declarative application packs to feed the existing knowledge catalog without changing workflow planning, compilation, grounding, or persistence.

## Packages

- `@awm/capability-sdk` — contracts, schemas, builders, and validation.
- `@awm/capability-registry` — deterministic indexes and the generated pack manifest.
- `@awm/knowledge` — compatibility adapter and the unchanged consumer-facing catalog.

No capability pack is registered in the foundation milestone.

## Dependency direction

```text
@awm/shared
    ↑
@awm/capability-sdk
    ↑
application capability packs
    ↑
@awm/capability-registry
    ↑
@awm/knowledge
```

`@awm/shared` must never import the SDK, registry, or knowledge package.

## Pack authoring

Application packs must export one declarative `ApplicationCapabilityPack` created with `defineApplicationCapabilityPack`. A pack declares:

- stable identity, aliases, version, and compatibility range;
- authentication;
- triggers, actions, searches, and webhooks;
- inputs, outputs, cardinality, batch behavior, idempotency, and pagination;
- limitations and alternatives;
- documentation and provenance;
- explicit platform mappings with verification evidence.

Unverified connector support must be `unknown`. Native support requires verified, dated source evidence.

## Registration

Runtime directory scanning is not used. Pack packages opt in through `"awmCapabilityPack": true` in their `package.json`. Run:

```bash
npm run capabilities:generate
npm run capabilities:check
```

Generation writes a stable, sorted TypeScript manifest. Production builds fail when the manifest is stale.

## Compatibility

`adaptCapabilityPackToKnowledge` converts SDK packs into the existing `ApplicationPack` and `OperationDefinition` contracts. The empty foundation manifest guarantees that the existing knowledge catalog is unchanged until a capability pack is separately approved and registered.

## Quality gates

Every pack is rejected for:

- schema or namespace violations;
- duplicate operations, limitations, or documentation;
- invalid internal references;
- batch/cardinality contradictions;
- unsupported mappings without alternatives;
- unknown mappings without explicit limitations;
- native mappings without verified evidence.

See [the approved architecture](../outputs/application-capability-sdk-architecture.md) for the full pack design and staged migration plan.
