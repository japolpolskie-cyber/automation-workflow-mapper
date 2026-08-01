# Next session

## Exact task

Phase D Sprint 3 — Wait, Approval, and Loop-family deterministic detectors only.

## Scope

- Implement deterministic Wait and active human Approval detection against the existing capability-detection contract.
- Implement only the existing Retry, Follow-up, Revision, Polling, and Return-to-step Loop-family concepts.
- Preserve exact evidence offsets, bounded confidence, ambiguity, clarification, and temporary business-level entity hints.
- Keep every result at suggestion level for future Workflow Brief review.

## Explicit exclusions

- No Filter, Iterator, Aggregator, Merge, Trigger, Action, Error Handler, Sub-workflow, Terminal, or AI detectors.
- No Workflow Brief generation, mutation, confirmation, or locking.
- No prompts, providers, Ollama calls, models, tools, or runtime memory.
- No UI, graph compilation, planner integration, or platform translation.
- No catalog or shared-schema expansion unless a separately verified compatibility defect is found.

## Completion standard

The result should add only Wait, Approval, and the five Loop-family deterministic detectors with evidence-bearing suggestions and focused boundary/false-positive coverage, without generating a Workflow Brief or changing runtime planning behavior.
