# Next session

## Current status

The Mapper remains production-usable. A separate internal endpoint can now generate validated draft Workflow Brief JSON using Router and Binary Decision detection. Further detector families and Mapper integration remain optional future work.

## Current boundary

- The draft endpoint is experimental, review-only, and separate from production generation.
- Draft scaffolding supplies the schema-required start boundary and review action until ordinary trigger/action detection is explicitly scoped.
- No provider calls, UI, graph generation, platform translation, persistence, automatic confirmation, or locking are part of this slice.

Any next sprint must select one optional future improvement explicitly rather than treating this vertical slice as authorization for broader Mapper integration.
