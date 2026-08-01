# Feature inventory

| Feature | Status | Notes |
| --- | --- | --- |
| Requirement segmentation and deterministic evidence | Implemented | Clause/step evidence, confidence, facts, and clarifications. |
| Canonical function catalog | Implemented | Trigger, action, retrieval, validation, decisions, iteration, aggregation, delay, approval, notification, logging, and related controls. |
| Deterministic skeleton compilation | Implemented | Explicit decisions, routes, loops, retries, iterators, aggregators, merges, approvals, and terminal paths. |
| Application detection and bounded knowledge retrieval | Implemented | Uses shared registry and verified knowledge packs. |
| Capability-constrained node grounding | Partially implemented | Implemented and tested; feature-controlled and catalog coverage is incomplete. |
| Semantic edge grounding | Partially implemented | Implemented and tested; feature-controlled and bounded to known edge roles. |
| Graph critique, safe repair, and acceptance matrix | Implemented | Preserves topology and rejects unsafe promotion candidates. |
| n8n, Make, and Zapier translation | Implemented | Produces validated planning/build artifacts, not deployments. |
| Local deterministic fallback provider | Implemented | Builds from owned semantic artifacts when model generation is unavailable or not selected. |
| Ollama and OpenAI-compatible providers | Implemented | Optional single-request generation paths. |
| V2 shadow and promotion pipeline | Partially implemented | Shadow artifacts and promotion gates exist; promotion is disabled by default. |
| Canonical internal Workflow Brief schema | Implemented | Phase B Sprints 1–4 define, harden, test, and document the strict v1.0 business contract, including compatibility fixtures and pure serialization. Detection and runtime integration remain planned. |
| Conceptual node-function catalog | Implemented | Phase C Sprints 1–6 finalize 23 detailed contracts, stable public constants, pure whole-catalog validation, complete Workflow Brief compatibility coverage, defensive-copy guarantees, and cross-contract consistency tests. Detection and runtime integration remain planned. |
| Capability-detection contract | Partially implemented | Phase D Sprints 1–3A provide the strict contract plus deterministic Router, Binary Decision, Wait, and Approval detectors with exact evidence, ambiguity handling, overlap precedence, and temporary entity hints. Other catalog functions remain undetected. |
| Internal draft Workflow Brief endpoint | Implemented | `POST /api/internal/workflow-brief/draft` runs Router, Binary Decision, Wait, and Approval detection, assembles schema-valid reviewable JSON with explicit draft scaffolding, and remains separate from production Mapper generation. |
| Internal Workflow Brief preview page | Implemented | `/internal/workflow-brief` submits raw requirements only to the internal draft endpoint and displays detection, routes, clarifications, scaffolding, and read-only JSON without production navigation or Mapper integration. |
| Interactive Workflow Brief review | Planned | Must follow schema and confidence design. |
| Brief-to-graph compiler integration | Planned | Mapper will consume a locked brief. |
| Ollama two-step skeleton/enrichment generation | Deferred | Re-evaluate only after brief integration and platform validation. |
| Broad application-pack expansion | Deferred | Add only repository-verified operations in isolated sprints. |
