# Known issues and gaps

## Capability coverage

- Trello, Shopify, Airtable, HubSpot, Stripe, and ClickUp have unsupported or incomplete verified application packs.
- Outlook attachment retrieval and message-search operations remain unsupported in the verified pack.
- Similar provider capabilities must not be inferred from external product similarity; unsupported mappings remain explicit until verified in the repository.

## Language and topology boundaries

- Complex nested decisions and conditions with more than two outcomes remain outside the bounded natural binary rule.
- Implicit wording can leave per-item notification versus collection-completion notification ambiguous.
- Indirect wait language such as “hold this for later” may retain generic behavior because it supplies no recognized duration, date, event, or resume condition.
- Router outcome extraction is deterministic and bounded; unusual prose or implicit default routes may require clarification.

## Grounding and operations

- Internal control nodes are deliberately application-neutral but still appear in missing-capability reporting.
- Multiple equally plausible operations can remain unresolved when deterministic scoring cannot select a unique candidate and no optional selector is configured.
- Stage C and Stage D are disabled by default even though benchmark tests exercise them directly.

## Evidence limitations

- `outputs/real-world-workflow-validation-report.md` and `outputs/remaining-eight-benchmark-improvements-report.md` are historical checkpoints, not current results.
- `CHANGES.md` was requested as an input but does not exist in the repository.

