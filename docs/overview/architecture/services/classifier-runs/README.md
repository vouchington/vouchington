# Classifier runs service

Source entrypoint: [backend/services/classifier-runs/README.md](../../../../../backend/services/classifier-runs/README.md)

`@services/classifier-runs` is the one lifecycle every fixed classifier (C5 and C6 today, C8 and
C9 later) runs on. A classifier supplies a `ClassifierRunAdapter`: how to lock and read a subject's
current content, how to resolve its configuration, and how to turn durable outcomes into effects.
Receipt, lease, reclaim, provider-attempt reservation and cap, terminal failure, completion,
supersession, dispatch and sweep are shared, so a new classifier is input building plus outcome
application only.

## Architecture decision

One shared `classifier_runs` receipt table with per-entity subject foreign keys, served by one
service with per-classifier adapters, rather than a per-classifier receipt table or a shared
service over per-classifier tables. A classifier adds a row in `classifiers` and an adapter; it
adds no table. The trade-off is one table that every classifier writes; it stays unpartitioned
because a unique index over a partitioned table must contain the partition key, and it has an
unbounded-growth entry in the schema-growth registry.

A run's attempt reservation and cap stay a monotone `provider_attempts_started` counter on the
receipt, reserved inside the client's `beforeAttempt` hook after the shared spend-cap check. There
is no child attempts table: the counter, the C3 decision batch and the billing hooks already
bound provider spend per run at `maxAttempts` and short-circuit a replay of persisted outcomes, and
a ledger would only re-derive them. C6's former per-claim attempts ledger
(`autotagger_receipt_attempts`) is dropped for the same reason.

## Identity

A run is identified by `(classifier, subject, input SHA-256, configuration SHA-256)`, enforced by
one partial unique index per subject kind. The input hash is the subject's content digest and the
configuration hash is over PostgreSQL's canonical `jsonb::text`, so JavaScript key ordering is not
an identity boundary. A run's candidate set is deliberately not part of its identity: the C6
candidate topics are captured once, when the receipt is reserved, and stored with it, so a
candidate set that would change later (a fresher embedding, a plan change, another search result)
cannot create a second receipt for the same content.

A remote plan is a topic plan (C5, C6) or a community-prompt plan (C8). The latter pins prompt ids,
stores and captures no candidates, and puts its rule set in the configuration hash.

The identity admits one receipt per classifier scope and content version, the receipt owns one
pre-reserved C3 decision batch, and the attempt counter is capped and monotone. Provider spend per
run is bounded by that cap, not by one call: a crash or lease loss between the provider returning
and the outcomes being persisted can reserve and spend another attempt. Once the outcomes are
durable, retries, lease expiry and replays return them without a model call, and none of them
creates a second receipt.

## Tables

| Table                            | Role                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classifier_runs`                | The receipt: identity, snapshot, pre-reserved batch, attempt and sweep counters, lease, terminal kind, persisted-outcomes, completion and supersession timestamps.                 |
| `classifier_run_requests`        | The durable "this subject wants a run" row, written where the subject becomes eligible and independent of configuration. It is what lets the sweep find a subject with no receipt. |
| `classifier_run_candidates`      | Insert-only, ordered candidate topic ids a run captured at reservation (C6). Not part of the identity; a replay reads them and never searches again.                               |
| `post_classifier_local_outcomes` | Insert-only C5 local detector outcome, one row per run, written on every terminal kind that has one.                                                                               |

A request is settled by exactly one of: a run, `no_work_at`, or `stale_at`. Re-approving a
subject re-arms a settled or stale request for its new content hash. Deleting a run returns its
request to the sweep.

## Lifecycle

Every write locks in one order: the subject (through `adapter.lockCurrent`), the run row, the
actor, and then the adapter's configuration is re-resolved. A mismatch between the durable run and
the resolved current state means the run is obsolete and is superseded, never repaired in place.

1. **Request.** `requestClassifierRuns` writes one request per classifier in the caller's
   transaction and marks older-hash requests stale. Post approval requests C5 and C6 together
   (`APPROVAL_CLASSIFIER_SLUGS`); a post approved at creation requests C6 from
   `processPostCreated` (`requestApprovedPostClassifierRuns`); an RSS upsert requests C6 for each
   written feed item (`requestRssFeedItemClassifierRuns`, which has no approval gate).
2. **Reserve.** `reserveClassifierRun` locks the subject, checks the adapter's optional `ready`
   gate (C6: the subject's embedding was built from its current content), resolves configuration,
   captures the candidate set for a classifier that has one (`adapter.captureCandidates`, reusing
   an existing receipt's set instead of searching again), and inserts the receipt with a
   pre-generated decision batch. Outcomes are `reserved`, `no-work`, `stale` and `not-ready`. A
   missing or unresolvable configuration never blocks approval: the request stays for the sweep.
   An adapter that resolves no configuration (the C6 kill switch) or captures no candidates settles
   the request as no work.
3. **Claim.** `claimClassifierRun` takes a 60-second fenced lease. Order of checks: completed,
   terminal, live lease, then reclaim. A superseded run whose identity is current again is
   revived.
4. **Attempt.** `startClassifierProviderAttempt` reserves the provider attempt before the model
   call, at most `maxAttempts` per receipt. At the cap it persists the local outcome and marks the
   receipt terminal `attempts-exhausted`.
5. **Outcomes.** `persistClassifierRunOutcomes` writes the local outcome and the C3 decision
   batch atomically. A run with persisted outcomes never calls the provider again. A run that
   captures its own candidates and has none left (every captured topic was hard-deleted, and the
   captured rows cascade with it) has no remote work: it persists without a decision and completes
   with no effects, instead of waiting for a question set that can no longer exist.
6. **Complete.** `completeClassifierRun` applies the adapter's effects and stamps completion in one
   transaction; a replay returns `replay`.
7. **Supersede.** `supersedeStaleClassifierRun` retires an obsolete run and reserves the current
   one.

Terminal kinds are `provider-error`, `invalid-result`, `context-rejected`, `attempts-exhausted`,
`client-unavailable` and `sweep-bound-exceeded`. A terminal kind is immutable, and the run's local
outcome is persisted on every terminal write that has one. `context-rejected` is accepted by the
schema and lifecycle; the executor does not produce it until provider error classification (#689)
lands.

## Recovery sweep

The sweep has two discovery queries, both bounded, keyset-paginated and drained across ticks:

- **Incomplete runs** (`listIncompleteClassifierRuns`): non-terminal, non-superseded runs without
  completion. Each page enqueues the stable-id `classifier-run` job for runs whose job is gone.
- **Pending requests** (`listPendingClassifierRunRequests`): requests with no run, no settlement
  and an adapter-supplied eligibility predicate (`requestEligibility`), so a subject that never
  got a receipt is dispatched. C6 carries its embedding predicate here, so waiting for an
  embedding never spends the run's sweep bound.

Only an enqueue that `addBulk` actually added counts toward `CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND`
(10). At the bound, a run is given up only once its stable-id job no longer exists, becoming
terminal `sweep-bound-exceeded`. A permanent outcome is never re-dispatched; a transient-exhausted
receipt is re-dispatched only while attempts remain. The sweep stops before enqueueing on a
spend-cap breach.

## Recovery transitions

| Failure mode                | Durable state and recovery                                                                          | Idempotency evidence                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Approval without a receipt  | The request row is written in the approval transaction; the sweep dispatches every pending request. | One request per `(classifier, subject, input hash)`.               |
| Dispatch failure            | The reservation is durable before the child enqueue; the sweep re-enqueues an incomplete run.       | Receipt identity; stable `classifier_run_<id>` job id.             |
| Provider non-consumption    | The attempt releases its lease before a rejected admission, or records a retryable failure.         | Lease token fences a later claim.                                  |
| Provider reply or loss      | Persisted outcomes are read and completed without another provider call.                            | Pre-reserved C3 batch; outcome stamps are immutable.               |
| Retry and lease expiry      | A live lease delays the duplicate job; an expired lease is reclaimed by the next claim.             | Run id, content hash and configuration hash must all match.        |
| Content or config drift     | The obsolete run is superseded; the current fingerprint is reserved.                                | Supersession is durable and releases the old lease.                |
| Missing configuration       | Approval commits; the request stays pending and the sweep retries.                                  | The request is unsettled until a run, no-work or stale settles it. |
| Provider client unavailable | The remote half ends as `client-unavailable`, keeps the local outcome and alarms once.              | Terminal kind is immutable; local outcome is insert-only.          |
| Attempt cap                 | The cap check terminates the run as `attempts-exhausted`; the sweep does not re-dispatch it.        | The attempt counter never decreases.                               |
| Sweep bound                 | Only jobs actually added count; at 10 with the job gone the run is given up and alarms.             | The counter never decreases.                                       |

The oldest incomplete run or pending request older than 26 hours (longer than spend-cap parking)
raises a throttled `run-age` or `request-age` alarm through `recordClassifierRunAlarm`
(`@modules/on-error`, Sentry message `classifier_run_alarm`, grouped by `alarm_kind`).

## Adding a classifier

C5 and C6 are the two adapters today. C8 and C9 add a `classifiers` row, an adapter, an input
builder for `@agents/classifier-runs`, and a registration in the worker's classifier-run registry.
They add no lifecycle code, queue, table or sweep.

## Related

- [Classifier runs agent executor](../../ai-agents/classifier-runs/README.md)
- [Post classifier service (C5 adapter)](../post-classifier/README.md)
- [Autotagger service (C6 adapter)](../autotagger/README.md)
- [Classifier persistence service](../classifiers/README.md)
- [AI agents queue](../../queues/ai-agents/README.md)
