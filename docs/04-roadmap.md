# Roadmap

## Phase A — Documentation baseline

Establish the verified project status, architecture boundary, feature inventory, decision history, completed accuracy work, known gaps, and next-session contract. This phase is the current checkpoint.

## Phase B — Canonical Workflow Brief schema

Design the internal, versioned business-requirement contract only. Define evidence, decisions, semantic routes, cardinality, wait boundaries, applications, capability requirements, confidence, clarifications, and lock/review state. Do not add provider calls, UI, or graph generation in this phase.

Sprint 1 is implemented: the shared package now provides the strict `CanonicalWorkflowBrief` foundation for actors, applications, business-level triggers, and actions, including unique-ID and cross-reference validation. Control-flow, evidence, confidence, clarification, and review/lock contracts remain for later explicitly scoped sprints.

Sprint 2 is implemented: the brief now represents business-level decisions and semantic routes, bounded loops, waits, human approvals, merges, iterators, and aggregators with strict semantic and referential validation. Evidence, confidence, clarification, and review/lock contracts remain deferred to the next schema sprint.

## Phase C — Complete conceptual node-function catalog

Compare brief concepts against the existing canonical function model and close only demonstrated conceptual gaps without duplicating functions.

## Phase D — Capability detection and confidence

Define how verified application operations, platform mappings, unsupported states, ambiguity, and confidence attach to brief requirements.

## Phase E — Interactive Brief review

Design and implement review behavior for users to confirm, edit, reject, or lock business needs and unresolved decisions before compilation.

## Phase F — Brief-to-graph compiler integration

Make the locked brief the compiler input and business authority. Preserve traceability from every graph node and branch to brief facts.

## Phase G — Platform translation validation

Validate that n8n, Make, and Zapier translations preserve the locked brief, canonical topology, platform limitations, and unsupported states.

## Phase H — Re-evaluate Ollama two-step generation

Measure whether separate skeleton and enrichment calls improve quality after the brief/compiler boundary is stable. Retain the current generation path unless evidence supports the added complexity.
