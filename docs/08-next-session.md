# Next session

## Current status

The Mapper remains production-usable. The internal Workflow Brief endpoint and preview support Router, Binary Decision, Wait, and Approval detection. Router and Wait recognize bounded natural-language semantic facts before their exact-pattern fallbacks. Router cue coverage includes enquiry/topic, interest, assistance, membership, service/category selection, and category-based handling language while retaining three-or-more-outcome and fan-out safeguards. Loop-family and other detectors remain deferred.

## Current boundary

- Drafts remain unlocked, unconfirmed, unpersisted, and separate from production Mapper generation.
- Wait and Approval are suggestion-first; entities are materialized only from sufficient explicit business information.
- No Loop-family, collection, merge, filter, action, trigger, error, terminal, sub-workflow, or AI detection is implemented.
- No provider calls, graph compilation, platform translation, or canvas integration is included.
- Semantic preprocessing remains deterministic and limited to Router and Wait, with safeguards for their documented false positives. Binary Decision and Approval retain their current rules; no AI/provider semantic analysis exists.

Any next sprint must select one deferred detector family explicitly.
