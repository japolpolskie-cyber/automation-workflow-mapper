# K4 Planner Integration Report

## Architecture summary

K4 adds a deterministic, score-free planning boundary and a second grounded provider call. Production generation remains unchanged and continues to be persisted. The grounded plan is abstract, validated, compared in memory, returned as optional response metadata, and never persisted or rendered.

```text
Business request
  -> K3/K3.1 deterministic analysis
  -> PlannerContextBuilder (scores removed structurally)
  -> PlannerPromptBuilder (modular sections + runtime enums)
  -> Qwen grounded shadow call
  -> StructuredWorkflowPlan
  -> hard operation/application/function/clarification gates
  -> non-persisted comparison report

Existing production provider call -> existing validation -> existing renderer (unchanged)
```

## Planner context contract

The context contains objective, platform, planning facts, score-free evidence, clarifications, patterns, manuals, selected operation knowledge, capabilities, allowed applications, allowed canonical functions, supported operations, limitations, alternatives, and planner constraints.

It cannot contain confidence, evidence weight, coverage, reliability, completeness penalties, QA scores, or benchmark scores because those fields do not exist in `plannerContextSchema`.

## Prompt contract

The prompt is assembled as named sections: Planning Objective, Business Context, Detected Facts, Detected Patterns, Retrieved Knowledge, Allowed Operations, Planning Rules, Planner Constraints, and Output Schema. Runtime JSON Schema enums constrain application references, operation references, and canonical functions.

## Files created

- `packages/shared/src/planner.ts`
- `apps/server/src/planner/planner-context-builder.ts`
- `apps/server/src/planner/planner-prompt-builder.ts`
- `apps/server/src/planner/planner-shadow-service.ts`
- `apps/server/src/planner/planner-context-builder.test.ts`
- `apps/server/src/planner/planner-shadow-service.test.ts`
- `apps/server/src/planner/k4-shadow-benchmark.test.ts`
- `outputs/k4-planner-integration-report.md`

## Files modified

- `packages/shared/src/index.ts`
- `packages/shared/src/domain.ts`
- `apps/server/src/ai/providers/analysis-provider.ts`
- `apps/server/src/ai/providers/openai-provider.ts`
- `apps/server/src/ai/providers/ollama-provider.ts`
- `apps/server/src/ai/providers/ollama-provider.test.ts`
- `apps/server/src/services/analysis-service.ts`
- `apps/server/src/services/analysis-service.test.ts`
- `apps/server/src/config/environment.ts`
- `apps/server/src/config/environment.test.ts`
- `apps/server/src/app.ts`
- `apps/server/src/app.test.ts`

The existing production prompt file was not modified.

## Live Qwen benchmark

Model: local `qwen3:8b`, temperature 0, final K4 contract.

| Scenario | Prompt chars | Retrieved knowledge chars | Latency | Steps | Invalid refs |
|---|---:|---:|---:|---:|---:|
| Asana CRM | 16,117 | 11,738 | 113.0 s | 8 | 0 |
| Shopify fulfillment | 14,233 | 4,546 | 65.7 s | 5 | 0 |
| Gmail attachment intake | 12,396 | 11,842 | 65.1 s | 5 | 0 |

Asana used verified Asana task-moved and task-details operations, Google Drive find/create folder, Gmail send-email, and Google Sheets add-row. Gmail attachment intake preserved Iterator and Aggregator and used verified Drive upload and Sheets add-row operations. Shopify retained Shopify as a grounded application without inventing an unverified Shopify operation; Slack used a verified notification operation.

The existing Asana planner call failed at the Ollama request after prolonged generation, while Ollama remained reachable. Therefore no fabricated old-planner latency is reported. Earlier unconstrained live K4 iterations exposed paraphrased identifiers; the final runtime enum contract eliminated them in all three final scenarios.

## Comparison and quality observations

- Unsupported operation references: 0 across final live scenarios.
- Invalid application references: 0.
- Invalid canonical function references: 0.
- Required clarification preservation is enforced as a hard gate.
- Unsupported platform operations are excluded from the allowed enum but remain visible with limitations and alternatives.
- Application registries without verified operation packs remain usable as application references but cannot silently produce invented operations.
- The deterministic benchmark suite shows additional semantic functions compared with the existing node categories in all three scenarios.

## Regression and persistence report

- Production provider input and production prompt remain byte-for-byte compatible in tests.
- Existing workflow generation remains the persisted source of truth.
- Grounded plans and comparison metrics are response-only and are not stored in workflow or database records.
- No database migration or persisted workflow schema change was made.
- Disable with `K4_PLANNER_SHADOW=false` without disabling K3 analysis.
- A shadow run adds a second model call and can roughly double local model work; this is the primary rollback/performance risk.

## Verification

- Shared: 25 tests passed.
- Knowledge: 8 tests passed.
- Platforms: 8 tests passed.
- Server: 82 tests passed.
- Client: 4 tests passed.
- Total: 127 tests passed.
- Full workspace typecheck passed.
- Production client build passed.
- Pre-existing client bundle warning remains (main bundle approximately 1.02 MB before gzip).

## Recommended commit

`feat(analysis): add grounded planner shadow integration`

K5 was not started.
