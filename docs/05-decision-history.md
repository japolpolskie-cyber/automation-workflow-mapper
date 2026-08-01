# Decision history

## Semantic router labels

- Original plan: Branch labels could be derived from destination node names during graph construction.
- Reason considered: Destination titles were readily available and appeared to provide understandable labels.
- Current decision: Router labels represent semantic route outcomes and originate in requirement analysis; future Workflow Brief data will become their authoritative source.
- Reason for change: Destination names describe actions, not the business condition that selects a route. Semantic labels preserve intent across graph and platform translations.
- Status: Active.

## Workflow Brief product boundary

- Original plan: Build a standalone Workflow Brief Generator application.
- Reason considered: A separate product could specialize in discovery and hand a document to the Mapper.
- Current decision: Build an internal Workflow Brief Engine inside Automation Workflow Mapper.
- Reason for change: A shared internal contract avoids duplicated parsing, fragmented ownership, and integration drift while retaining a clear analysis/compiler boundary.
- Status: Superseded.

## Requirement authority

- Original plan: The Mapper would reanalyze raw requirements when constructing the workflow.
- Reason considered: The existing analysis pipeline already accepted raw scope and could independently produce planner facts.
- Current decision: The Workflow Brief determines and locks business needs; the Mapper compiles and translates the locked brief.
- Reason for change: Reanalysis can change decisions, route meanings, or assumptions after review. A locked contract provides stable traceability and user control.
- Status: Active as future direction; implementation is planned.

## Ollama generation shape

- Original plan: Evaluate separate Ollama skeleton-generation and enrichment calls.
- Reason considered: Separating topology from descriptive enrichment may improve structure and prompt focus.
- Current decision: Keep the existing generation path and defer two-step evaluation until the Workflow Brief/compiler boundary and translation validation are stable.
- Reason for change: Two-step generation adds latency and coordination before the authoritative business contract is defined.
- Status: Deferred.

## V2 production authority

- Original plan: Evaluate V2 artifacts alongside the established provider workflow.
- Reason considered: Shadow comparison permits evidence gathering without changing persisted production behavior.
- Current decision: Keep shadow execution available and promotion gated; leave promotion disabled by default.
- Reason for change: Production authority must change only after conceptual, platform, capability, critic, unresolved-operation, and canonical-adaptation gates pass.
- Status: Experimental.

