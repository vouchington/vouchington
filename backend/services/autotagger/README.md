# Autotagger

Durable receipt/lease bookkeeping for the C6 tagging-classifier autotagger, plus the paid-tier
topic-count limits that gate it.

## Overview

The autotagger dispatch path (`backend/agents/autotagger/`) tags posts and RSS feed items with
topics by running the shared C6 structured-decision classifier (`@services/classifiers`, prompt
slug `tagging`) against embedding-similar candidates. This service package owns the durable state
around that dispatch, not the classifier call itself:

- **Receipt claim/complete lifecycle** (`claim-autotagger-receipt.mts`,
  `complete-autotagger-receipt.mts`) — an `autotagger_receipts` row identifies one
  (subject, digest_version, digest) dispatch identity exactly once. Claiming is atomic and
  lease-fenced: a brand-new identity is claimed on insert; an already-completed identity returns
  `completed` so the caller can re-apply idempotent vote application without re-dispatching; a
  live lease returns `in_progress`; an expired lease is reclaimed under a new lease token and
  attempt number, fencing out the previous claimant. `completeAutotaggerReceipt` terminally clears
  the lease and marks the matching attempt completed, fenced by `leaseToken`.
  `failAutotaggerReceipt` records a non-terminal attempt failure
  (`AutotaggerReceiptFailureOutcome`: `'provider-error' | 'invalid-result'`) so the lease can
  expire and a retry can recover.
- **Receipt digest** (`receipt-digest.mts`) — `computeAutotaggerReceiptDigest` hashes the
  candidate-set identity (state, questions, scope, effective cap, classifier/prompt/model
  identity) into the `Buffer` that keys a receipt. Changing any input mints a new receipt identity
  rather than colliding with a stale one; `AUTOTAGGER_RECEIPT_DIGEST_VERSION` exists to force that
  same effect across a schema/semantics change to the digest inputs themselves.
- **Paid-tier limits** (`limits-config.mts`) — `getAutotaggerPaidLimitsFields` resolves the
  dynamic-config-backed `AutotaggerPaidLimitsFields`: a global `enabled` kill-switch, the post
  author's tiered `max_topics` cap (free/plus/pro), and the two independent RSS enrichment tiers
  (discoverable-source LLM pass, paid-follower collaborative pass). This is the intended
  "pause autotagging" switch — not classifier deactivation, which the dispatch path treats as a
  configuration error (see below).

`prompts.mts`'s `getActiveAutotaggerPrompt` is a separate, legacy lookup: it resolves the
`autotagger` system user's agent prompt for C7's free-form-reasoning residual path
(`backend/agents/autotagger/openai-autotagger.mts`), which has no current production caller. C6's
own configuration lookup (`getActiveClassifierConfigurationBySlugFromPrimary('tagging')`) is
unrelated and lives in `@services/classifiers`; if that classifier configuration is missing or
deactivated, dispatch throws rather than silently no-op'ing, since the sanctioned way to pause
autotagging is the `enabled` field above, not classifier deactivation.

## Key Files

- `claim-autotagger-receipt.mts` — `claimAutotaggerReceipt`, `AutotaggerReceiptSubject`,
  `ClaimAutotaggerReceiptResult` (`'claimed' | 'in_progress' | 'completed'`)
- `complete-autotagger-receipt.mts` — `completeAutotaggerReceipt`, `failAutotaggerReceipt`,
  `AutotaggerReceiptFailureOutcome`
- `receipt-digest.mts` — `computeAutotaggerReceiptDigest`, `AUTOTAGGER_RECEIPT_DIGEST_VERSION`
- `limits-config.mts` — `autotaggerPaidLimitsConfig`, `getAutotaggerPaidLimitsFields`,
  `AutotaggerPaidLimitsFields`
- `prompts.mts` — `getActiveAutotaggerPrompt` (C7 legacy path only, see above)

## Architecture Notes

- Dispatch, candidate search, and state building live in `backend/agents/autotagger/`
  (`run.mts`, `run-rss-feed-item.mts`, `dispatch-classifier.mts`,
  `dispatch-classifier-execute.mts`, `dispatch-classifier-bindings.mts`), not here — this package
  is the durable receipt/limits layer those modules call into.
- A receipt identity is scoped by digest, not by content hash + separate dedup tables: there are
  no `post_autotagger_results` / `rss_feed_item_autotagger_results` tables or upsert helpers in
  this path. Applying the classifier's vote outcome is `applyTopicClassifierDecisionVotes`
  (`@services/classifiers`), keyed off the receipt's `batchId`.
- Any dispatch error other than a classified provider/invalid-result failure is left to propagate
  uncaught to the queue worker, which is what turns it into a BullMQ job failure/retry — a
  stuck/expired lease is cheap and safe to retry from scratch.

## Related

- Classifier configuration/decision persistence: [backend/services/classifiers/README.md](../classifiers/README.md)
- Dispatch/candidate-search entry points: [backend/agents/autotagger/README.md](../../agents/autotagger/README.md)
- System users: [`backend/services/users/system-users.mts`](../users/system-users.mts)
