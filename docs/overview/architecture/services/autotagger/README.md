# Autotagger

Source entrypoint: [backend/services/autotagger/README.md](../../../../../backend/services/autotagger/README.md)

The C6 tagging-classifier adapter and the C7 scoped reasoning adapter for the shared
classifier-run lifecycle, plus the paid-tier topic-count limits that gate them.

## Overview

The autotagger tags posts and RSS feed items with topics by running the shared C6
structured-decision classifier (`@services/classifiers`, prompt slug `tagging`) against
embedding-similar candidates. Receipt, lease, provider-attempt reservation and cap, terminal
failure, completion, supersession, dispatch and the sweep all belong to the shared
[classifier-run lifecycle](../classifier-runs/README.md); this package supplies only the
per-classifier input building and outcome application that lifecycle asks for:

- **Adapter** (`adapter.mts`) — `createAutotaggerRunAdapter` wires the pieces below into the
  lifecycle's `ClassifierRunAdapter` contract. Approved posts lock through
  `lockApprovedPostClassifierInput`; feed items through `lockRssFeedItemClassifierInput`.
- **Configuration** (`configuration.mts`) — `resolveAutotaggerRunConfiguration` reads the active
  `tagging` classifier and the shared classifier actor into the run's configuration (the prompt,
  model and actor that answer it). Its hash is the configuration half of the receipt identity. Tier
  caps and the candidate set are deliberately not part of it, so a plan change or a different
  embedding search result can never mint a second receipt for the same content. The operator kill switch (`enabled: false`) returns `null`, which settles the request as
  no work; a missing seeded classifier or system actor throws instead, so the subject stays
  eligible for the sweep and classifier configuration never blocks or delays approval.
- **Candidate capture** (`candidates.mts`) — `captureAutotaggerCandidateTopicIds` chooses the topics
  one run asks about, exactly once, when the receipt is first reserved. The ids are stored in
  `classifier_run_candidates` next to the receipt, so a later search result, embedding refresh or
  plan change cannot alter what an existing receipt asks or mint a second receipt.
  Posts use the author's tiered cap and the post embedding; feed items use the
  discoverable-source budget with feed-declared categories first. `null` means nothing to classify.
  The search runs before the reservation takes the subject lock and holds no lock while it reads
  (the plan, discoverability and vector lookups run on their own connections); the locked
  reservation keeps its result only while the content and configuration hashes it was chosen for
  are still current, and otherwise prepares again.
- **Readiness** (`readiness.mts`) — a subject is ready only once its embedding was built from its
  current content. `hasCurrentAutotaggerEmbedding` gates reservation (an unready request stays
  unsettled); `autotaggerRequestEligibility` puts the same predicate in the sweep query, so the wait
  for the embedding never burns the sweep's enqueue bound. Only the wait is transient: a request
  whose post is no longer approved, or whose feed item was deleted or moved to other content, fails
  the same predicate for good, so the sweep retires it as stale instead of re-scanning it (see the
  [sweep](../classifier-runs/README.md#recovery-sweep)). The embedding wait never retires a request.
- **Effects** (`effects.mts`) — `applyAutotaggerEffects` applies the durable decision to the exact
  post or feed item the run classified, inside the completion transaction
  (`applyTopicClassifierDecisionRelations`): each positive topic result creates or updates that
  subject's topic category relation and the shared classifier actor's relation vote, never a global
  topic vote and never a soft-deleted relation. The same topic on an unrelated subject is applied
  independently. A retry only ever sees the run incomplete or fully applied, and the returned
  `addedTopicIds` lists only the topics whose subject relation is live and net positive.
- **Paid-tier limits** (`limits-config.mts`) — `getAutotaggerPaidLimitsFields` resolves the
  dynamic-config-backed `AutotaggerPaidLimitsFields`: a global `enabled` kill-switch, the post
  author's tiered `max_topics` cap (free/plus/pro), and the two independent RSS enrichment tiers
  (discoverable-source LLM pass, paid-follower collaborative pass). This is the intended "pause
  autotagging" switch, not classifier deactivation. Tagging follows the author's membership at the
  time of posting: the plan is read once, when the receipt reserves its candidates, and is outside
  the receipt identity, so a post written on the free plan is never re-tagged when its author
  upgrades (there is no upgrade-triggered discovery and no backfill).
- **Candidate topic reads** (`read-candidate-topics.mts`) — the topic names and descriptions the
  question set is built from.

## C7 scoped reasoning autotagger

`agent/` holds the C7 adapter (`createAutotaggerAgentRunAdapter`, slug `autotagger-agent`). It
reads the same locked subject input as C6, so a subject is eligible for it exactly when it is for C6,
and differs only in these hooks:

- **Readiness** (`agent/readiness.mts`) — `hasCompletedFirstStage` gates reservation on a completed,
  non-superseded C6 run at the current content hash; `autotaggerAgentRequestEligibility` puts the
  same predicate in the sweep query. A C6 run that is still waiting or ended terminal leaves the
  request unsettled (C7 never runs without it).
- **Candidate capture** (`agent/candidates.mts`) — `captureAutotaggerAgentCandidateTopicIds` chooses
  the topics paying users follow, minus every topic the subject has any relation row for, ranked by
  distance and cut to `AUTOTAGGER_AGENT_MAX_CANDIDATES` (10). Null settles the request as no work.
  It runs once at reservation, after C6 completed, and the ids are stored with the receipt; the set
  is not part of run identity, so one subject and content version costs one run.
- **Configuration** (`agent/configuration.mts`) — the active `autotagger-agent` classifier and its
  distinct system actor; the shared operator kill switch returns null (no work).
- **Effects** (`agent/effects.mts`) — applies accepted topics with `applyTopicClassifierDecisionRelations`
  in `addOnly` mode, voted by the C7 actor; relations C6 or a person wrote are never touched.
- **Follow-on request** — C6's `applyAutotaggerEffects` calls `requestFollowOnClassifierRun` in the
  completion transaction, which writes C7's pending request for that content hash (it never re-arms
  a settled request).

## Key Files

- `adapter.mts` — `createAutotaggerRunAdapter`, `AutotaggerRunAdapter`
- `configuration.mts` — `resolveAutotaggerRunConfiguration`, `AutotaggerRunConfiguration`
- `candidates.mts` — `captureAutotaggerCandidateTopicIds`
- `readiness.mts` — `hasCurrentAutotaggerEmbedding`, `autotaggerRequestEligibility`
- `effects.mts` — `applyAutotaggerEffects`, `AutotaggerEffects`
- `agent/adapter.mts` — `createAutotaggerAgentRunAdapter` (C7), with `agent/{candidates,readiness,configuration,effects}.mts`
- `limits-config.mts` — `autotaggerPaidLimitsConfig`, `getAutotaggerPaidLimitsFields`,
  `AutotaggerPaidLimitsFields`

## Architecture Notes

- Model calls happen in `backend/agents/autotagger/` (the executor plus question-set building),
  never here.
- The receipt identity is `(classifier, subject, input hash, configuration hash)`. A retry, a lease
  expiry, a replay or a changed candidate set reuses the receipt. Persisted outcomes short-circuit
  any replay, and provider spend per run is capped at `maxAttempts` reserved attempts. A crash or
  lease loss between the provider returning and the outcomes being persisted can still spend again,
  within that cap.
- Every captured topic can be hard-deleted after reservation (the captured rows cascade with their
  topic). Such a run asks nothing: it persists no decision, applies no votes and completes without
  a provider call.
- Any failure other than a classified provider or invalid-result failure is left to propagate to the
  queue worker; an expired lease is cheap and safe to retry from scratch. The sweep recovers a
  subject that never got a receipt, because approval (or the RSS upsert) writes a durable
  `classifier_run_requests` row in its own transaction.

## Related

- Shared lifecycle: [docs/overview/architecture/services/classifier-runs/README.md](../classifier-runs/README.md)
- Classifier configuration/decision persistence: [docs/overview/architecture/services/classifiers/README.md](../classifiers/README.md)
- Executor and question-set building: [docs/overview/architecture/ai-agents/autotagger/README.md](../../ai-agents/autotagger/README.md)
- System users: [`backend/services/users/system-users.mts`](../../../../../backend/services/users/system-users.mts)
