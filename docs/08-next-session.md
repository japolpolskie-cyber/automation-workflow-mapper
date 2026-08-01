# Next session

## Current status

The Mapper remains production-usable. The internal Workflow Brief endpoint and preview support Router, Binary Decision, Wait, and Approval detection. Loop-family and other detectors remain deferred.

## Current boundary

- Drafts remain unlocked, unconfirmed, unpersisted, and separate from production Mapper generation.
- Wait and Approval are suggestion-first; entities are materialized only from sufficient explicit business information.
- No Loop-family, collection, merge, filter, action, trigger, error, terminal, sub-workflow, or AI detection is implemented.
- No provider calls, graph compilation, platform translation, or canvas integration is included.

Any next sprint must select one deferred detector family explicitly.
