# K3.1 Stabilization Report

## Outcome

K3.1 is implemented in shadow mode. It improves deterministic scope intelligence without changing Qwen prompts, workflow generation, or persisted workflow data.

## Architecture summary

- Scope analysis now begins with source-offset-preserving step and clause segmentation.
- Cardinality facts carry entity, segment, and step subjects instead of one global workflow cardinality.
- Application detection resolves against the complete shared application registry, with K2 packs used when available.
- Filter, Iterator, Loop, Merge, Aggregator, Retry, Error Handler, and Delay are first-class workflow-function facts.
- Approval actions are distinguished from business status values such as `Approved`.
- Explicit interval, attempt-limit, escalation, owner, and false-path phrases suppress unnecessary clarifications.
- Fact confidence measures correctness; coverage measures detected versus expected dimensions; reliability is `confidence × coverage`.
- Knowledge retrieval uses deterministic application, verb, entity, canonical-function, pattern, and manual matching within the configured character budget.

## Files created

- `apps/server/src/analysis/scope-segmentation.ts`
- `apps/server/src/analysis/scope-segmentation.test.ts`
- `apps/server/src/analysis/k3-1-acceptance.test.ts`
- `outputs/k3-1-stabilization-report.md`

## Files modified

- `packages/shared/src/detected-process.ts`
- `apps/server/src/analysis/scope-intelligence.ts`
- `apps/server/src/analysis/scope-intelligence.test.ts`
- `apps/client/src/components/DetectedProcessSummary.tsx`
- `apps/client/src/components/DetectedProcessSummary.test.tsx`
- `apps/client/src/styles.css`

## Public contracts

- Evidence source locations may include `segmentId` and `stepId`.
- Detected facts may use `workflow_function` and an entity/segment/step subject.
- Analysis summaries may include source segments, coverage, and workflow reliability.
- Both K3 rule version `1.0.0` and K3.1 rule version `1.1.0` remain valid.

All new summary fields are optional for backward compatibility.

## Acceptance benchmark

The 25-scenario K3.1 suite covers Facebook Lead Ads, Asana, Google Drive, Gmail, Google Sheets, Slack, HubSpot, Shopify, Salesforce, Dropbox, Airtable, Twilio, GoHighLevel, Outlook, Xero, and ClickUp. The expanded Asana CRM scenario detects a binary lead-response decision, four-way service routing, iteration, merge, explicit follow-up policies, and application operations with at least 85% coverage.

## Verification

- Shared tests: 25 passed.
- Knowledge tests: 8 passed.
- Platform tests: 8 passed.
- Server tests: 69 passed, including all 25 K3.1 acceptance scenarios.
- Client tests: 4 passed.
- Typecheck: passed for all workspaces.
- Production build: passed for all workspaces.

The client test and build required running outside the restricted Windows sandbox because Vite was denied access while resolving its own configuration. This was an environment restriction, not an application failure.

## Backward compatibility and rollback

- Qwen prompts unchanged.
- Workflow generation behavior unchanged.
- Persisted schemas and database migrations unchanged.
- Existing K1, K2, and K3 tests pass.
- K3 analysis remains shadow metadata behind the existing K3 feature flag.
- Rollback is low risk: disable the K3 feature flag or revert the additive K3.1 analysis/UI contracts.

## Known limitations and risks

- Deterministic language rules remain English-first and require versioned expansion for new phrasing.
- Coverage dimensions are rule-derived; they are auditable but not yet calibrated against a production corpus.
- Semantic operation retrieval intentionally favors precision and may omit weakly worded operations.
- The client production build retains a pre-existing large-chunk warning (main bundle approximately 1 MB before gzip).
- There is no Git repository in this workspace, so no commit was created here.

## Recommended commit

`feat(analysis): stabilize K3 deterministic scope intelligence`
