# Architecture

## Implemented architecture

```text
Requirement and documents
  -> deterministic segmentation and scope intelligence
  -> evidence, facts, clarifications, and knowledge retrieval
  -> deterministic skeleton / V2 conceptual graph
  -> Stage C capability-constrained node grounding
  -> Stage D semantic edge grounding
  -> graph critique, safe repair, and acceptance checks
  -> n8n / Make / Zapier translation
  -> canonical workflow and derived review/export views
```

The canonical workflow contracts in `packages/shared` are the persisted source of truth. Knowledge definitions in `packages/knowledge` constrain canonical functions, application operations, cardinality, and platform support. The server compiler owns topology; grounding stages may enrich references but must not mutate that topology. Platform packages and server translators turn conceptual roles into platform-specific implementation plans.

Provider generation and deterministic planning coexist. The local provider is a deterministic fallback. Ollama or OpenAI-compatible providers may generate a candidate, while schema validation, repair, capability checks, and the V2 promotion service determine whether that candidate can be used. Promotion defaults to disabled, preserving the provider path as authority while V2 artifacts run in shadow.

Router edge labels represent semantic route outcomes from requirement-derived facts. They are not inferred from destination node titles.

## Proposed future architecture

The internal Workflow Brief Engine will eventually sit between requirement analysis and graph compilation:

```text
Raw requirement -> reviewed, locked Workflow Brief -> graph compiler -> platform translation
```

The brief is intended to own business needs, routes, decisions, boundaries, applications, capability confidence, and unresolved questions. The Mapper should compile and translate that locked contract instead of independently reinterpreting raw prose.

This architecture is proposed, not implemented.

## Experimental or deferred

- V2 shadow comparison and controlled promotion modes are implemented but non-authoritative by default.
- Stage C and Stage D are feature-controlled and disabled by default.
- Distributed P2/P3 planner paths and Hybrid RAG are experimental and off by default.
- Ollama two-step skeleton/enrichment generation is deferred pending evaluation after brief-to-graph integration.

