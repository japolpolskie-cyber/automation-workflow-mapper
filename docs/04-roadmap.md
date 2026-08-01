# Roadmap

## Phase A — Documentation baseline

Establish the verified project status, architecture boundary, feature inventory, decision history, completed accuracy work, known gaps, and next-session contract. This phase is the current checkpoint.

## Phase B — Canonical Workflow Brief schema

Design the internal, versioned business-requirement contract only. Define evidence, decisions, semantic routes, cardinality, wait boundaries, applications, capability requirements, confidence, clarifications, and lock/review state. Do not add provider calls, UI, or graph generation in this phase.

Sprint 1 is implemented: the shared package now provides the strict `CanonicalWorkflowBrief` foundation for actors, applications, business-level triggers, and actions, including unique-ID and cross-reference validation. Control-flow, evidence, confidence, clarification, and review/lock contracts remain for later explicitly scoped sprints.

Sprint 2 is implemented: the brief now represents business-level decisions and semantic routes, bounded loops, waits, human approvals, merges, iterators, and aggregators with strict semantic and referential validation. Evidence, confidence, clarification, and review/lock contracts remain deferred to the next schema sprint.

Sprint 3 is implemented: the brief now carries source evidence, deterministic confidence bands, clarification questions, conceptual capability suggestions, review decisions, and explicit review/lock state. Locked briefs enforce resolved blocking questions, traceable capability evidence, and confirmed or required capability review without triggering runtime behavior.

Sprint 4 is implemented: the v1.0 public contract now exposes stable version and enum constants, validated serialization, breadth and negative compatibility fixtures, round-trip and immutability guarantees, and developer-facing contract and versioning documentation. Phase B schema work is complete; detection and runtime integration remain deferred.

## Phase C — Complete conceptual node-function catalog

Compare brief concepts against the existing canonical function model and close only demonstrated conceptual gaps without duplicating functions.

Sprint 1 is implemented: the knowledge package now exposes a strict conceptual node-function catalog with 23 entries, pure defensive-copy lookup helpers, and a detailed Router contract covering semantic routes, exclusions, safeguards, and Workflow Brief compatibility. Binary Decision and Loop-family contracts remain foundation entries for the next sprint.

Sprint 2 is implemented: Binary Decision and the Retry, Follow-up, Revision, Polling, and Return-to-step Loop-family entries are now strict detailed contracts. Their business inputs, outputs, safeguards, examples, exclusions, and Workflow Brief compatibility distinguish two-outcome decisions and each repeated-process boundary without adding detection or runtime behavior.

Sprint 3 is implemented: Wait, Approval, Merge, Iterator, and Aggregator are now strict detailed contracts. The catalog distinguishes event boundaries from repeated checking and outreach, active human approval from descriptive status, branch synchronization from collection aggregation, and item iteration from other loop families without adding detection or runtime behavior.

Sprint 4 is implemented: Trigger, Action, Filter, Error Handler, Sub-workflow, and Terminal are now strict detailed contracts. The catalog distinguishes start boundaries, concrete operations, one-sided gates, operational failure handling, reusable process delegation, and semantic finality while keeping capability-only concepts out of runtime implementation.

Sprint 5 is implemented: AI Agent, AI Classification, AI Extraction, AI Summarization, and AI Generation are now strict detailed conceptual contracts. The catalog distinguishes open-ended bounded interaction, known-label assignment, defined-field identification, faithful compression, and bounded artifact creation while preferring deterministic business behavior and excluding runtime AI configuration.

Sprint 6 is implemented: the complete 23-entry catalog now has stable derived constants, a pure structured audit helper, full category and Workflow Brief compatibility matrices, nested immutability guarantees, expanded implementation-leakage checks, and explicit cross-contract boundary coverage. No unresolved catalog consistency defect remains, so Phase C is complete.

## Phase D — Capability detection and confidence

Define how verified application operations, platform mappings, unsupported states, ambiguity, and confidence attach to brief requirements.

Sprint 1 is implemented: the knowledge package now exposes a strict v1.0 evidence-bearing capability-detection result, synchronous detector interface, no-op reference detector, catalog-backed ID validation, and pure Workflow Brief metadata preview. Empty results are valid, and no actual node-function detection rule, Workflow Brief generation, or runtime behavior was added.

## Phase E — Interactive Brief review

Design and implement review behavior for users to confirm, edit, reject, or lock business needs and unresolved decisions before compilation.

## Phase F — Brief-to-graph compiler integration

Make the locked brief the compiler input and business authority. Preserve traceability from every graph node and branch to brief facts.

## Phase G — Platform translation validation

Validate that n8n, Make, and Zapier translations preserve the locked brief, canonical topology, platform limitations, and unsupported states.

## Phase H — Re-evaluate Ollama two-step generation

Measure whether separate skeleton and enrichment calls improve quality after the brief/compiler boundary is stable. Retain the current generation path unless evidence supports the added complexity.
