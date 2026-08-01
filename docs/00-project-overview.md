# Project overview

## Purpose

Automation Workflow Mapper converts a business requirement into an explainable, platform-aware automation blueprint for expert review. It identifies business intent, required applications, canonical node functions, control-flow topology, capability limitations, and platform implementation guidance without automatically deploying the workflow.

Supported targets are n8n, Make, and Zapier.

## Main user flow

1. A user supplies a business scope and optional source documents.
2. Deterministic analysis segments the requirement, extracts evidence, identifies applications/functions/patterns, and records unresolved clarifications.
3. The planner compiles explicit workflow topology and validates its structural invariants.
4. Capability grounding selects only catalogued application operations; unsupported or ambiguous operations remain visible.
5. Semantic edge grounding and platform translators produce n8n, Make, and Zapier implementation guidance.
6. The canonical workflow is reviewed through product views and can be exported as a planning artifact.

## Planning paths and authority

- The default analysis provider is `local`. It creates a deterministic fallback from owned semantic artifacts and explicit requirement language.
- Ollama and an OpenAI-compatible provider are optional analysis providers. Ollama currently performs one generation request; two-step skeleton/enrichment generation is deferred.
- Deterministic scope intelligence, topology compilation, catalog grounding, critics, and validators constrain generated output and retain unsupported states.
- V2 analysis, conceptual graph, translation, critique, repair, and acceptance artifacts can run in shadow. V2 promotion is disabled by default, so the provider workflow remains authoritative unless promotion is explicitly enabled and all configured gates pass.
- The planned internal Workflow Brief Engine is not implemented. Its intended future role is to lock business needs before graph compilation.

## Repository structure

- `apps/client`: React application and workflow views.
- `apps/server`: API, providers, deterministic analysis, planner stages, persistence, validation, and export orchestration.
- `packages/shared`: versioned schemas and platform-neutral domain contracts.
- `packages/knowledge`: canonical functions, application packs, operation mappings, and platform capabilities.
- `packages/platforms`: platform adapters for n8n, Make, and Zapier.
- `outputs`: historical reports and benchmark evidence.

