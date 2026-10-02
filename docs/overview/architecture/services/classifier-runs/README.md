# Classifier runs service

Source entrypoint: [backend/services/classifier-runs/README.md](../../../../../backend/services/classifier-runs/README.md)

`@services/classifier-runs` is the one lifecycle every fixed classifier (C5, C6, C7, C8 and C9)
runs on. A classifier supplies a `ClassifierRunAdapter`: how to lock and read a subject's
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

A remote plan is a topic plan (C5, C6), a community-prompt plan (C8) or a story plan (C9). The
community-prompt plan pins prompt ids, stores and captures no candidates, and puts its rule set in
the configuration hash. The story plan captures its candidates at reservation like a topic plan, but
they are stories and standalone RSS items (`adapter.captureStoryCandidates`); the search result is
not part of the identity, so one RSS item version costs at most one model call however many
candidates are found.

The identity admits one receipt per classifier scope and content version, the receipt owns one
pre-reserved C3 decision batch, and the attempt counter is capped and monotone. Provider spend per
run is bounded by that cap, not by one call: a crash or lease loss between the provider returning
and the outcomes being persisted can reserve and spend another attempt. Once the outcomes are
durable, retries, lease expiry and replays return them without a model call, and none of them
creates a second receipt.

## Tables

| Table                            | Role                                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classifier_runs`                | The receipt: identity, snapshot, pre-reserved batch, attempt and sweep counters, lease, terminal kind, persisted-outcomes, completion and supersession timestamps.                                                                                            |
| `classifier_run_requests`        | The durable "this subject wants a run" row, written where the subject becomes eligible and independent of configuration. It is what lets the sweep find a subject with no receipt.                                                                            |
| `classifier_run_candidates`      | Insert-only, ordered candidates a run captured at reservation: topics (C5, C6) or stories and standalone RSS items (C9), one nullable foreign key per kind with an exact-one `CHECK`. Not part of the identity; a replay reads them and never searches again. |
| `post_classifier_local_outcomes` | Insert-only C5 local detector outcome, one row per run, written on every terminal kind that has one.                                                                                                                                                          |

A classifier that runs after another is requested by the first one: `requestFollowOnClassifierRun`
writes the follow-on's request in the first classifier's completion transaction (C6 requests C7), so
it commits or rolls back with the first result and never exists for a run that did not finish. It
never re-arms a settled request, so a replayed or reconfigured first run cannot schedule the
follow-on twice; it only revives one the sweep retired as stale for that content. The follow-on's
`requestEligibility` and `ready` require a completed, non-superseded first run at the same content
hash (`followsCompletedClassifierRun`, `hasCompletedClassifierRun`), so a first run that is waiting
or ended terminal never unlocks it.

A request is settled by exactly one of: a run, `no_work_at`, or `stale_at`. Requesting a
subject again re-arms a settled or stale request for its content hash, and a feed-item re-upsert
re-arms a stale one. Deleting a run returns its request to the sweep.

`stale_at` is also how the sweep retires a request that can never be classified. A request whose
subject is no longer live at the content it asked for (deleted, no longer approved, or moved to
other content) is terminal for that content version: it is settled stale and never selected again. A
subject that becomes live again at that content is re-armed by its producer, and new content gets
its own request. A producer re-arms in the transaction that makes the subject live, after the
subject lock: `requestClassifierRuns` (the moderation decision), `reviveClassifierRunRequests`
(a status write that approves a post), and the feed upsert. Reviving only returns a stale request
for the current content to the sweep; it never creates a request or widens the classifiers a
producer asked for.

## Lifecycle

Every write locks in one order: the subject (through `adapter.lockCurrent`), the run row, the
actor, and then the adapter's configuration is re-resolved. A mismatch between the durable run and
the resolved current state means the run is obsolete and is superseded, never repaired in place.

1. **Request.** `requestClassifierRuns` writes one request per classifier in the caller's
   transaction and marks older-hash requests stale. Post approval by the moderation decision
   (`checkPostClearance`) requests C5 and C6 together; a post approved at creation requests C6 from
   `processPostCreated` (`requestApprovedPostClassifierRuns`); an RSS upsert requests C6 and C9 for each
   written feed item (`requestRssFeedItemClassifierRuns`, which has no approval gate). A status
   write that approves a post (`setPostClearanceStatus`, `restorePostClearanceStatus`) requests
   nothing new but revives the post's stale requests for its current content, so a post approved
   again after the sweep retired its requests is swept again.
2. **Reserve.** `reserveClassifierRun` first prepares the candidate set for a classifier that has
   one (`adapter.captureCandidates` for topics, `adapter.captureStoryCandidates` for stories,
   skipped when the identity already has a receipt, whose set is reused instead of searching
   again), with no subject lock held, so the vector search and its lookups never block a writer of
   the subject. It then locks the subject, checks the adapter's optional `ready` gate (C6, C9: the
   subject's embedding was built from its current content; C7: C6 completed at this content), resolves configuration, and
   re-validates only what correctness needs: the prepared candidates are used only while the locked
   content hash and configuration hash still equal the ones they were chosen for. Otherwise the
   transaction rolls back and the reservation prepares again, at most
   `CLASSIFIER_RUN_RESERVE_ATTEMPTS` (3) times, then reports `not-ready` and leaves the request for
   the sweep. The receipt is inserted with a pre-generated decision batch. Outcomes are `reserved`,
   `no-work`, `stale` and `not-ready`. A missing or unresolvable configuration never blocks
   approval: the request stays for the sweep. An adapter that resolves no configuration (the C6
   kill switch) or captures no candidates settles the request as no work. The capture hooks and
   `ready` take any `QueryExecutor` and must be pure reads, because they also run outside the lock;
   `ready` also receives the locked current input, so a follow-on classifier can gate on the first
   classifier's result for exactly that content hash.
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
   one. Its replacement prepares candidates the same way, before the transaction and with the same
   bounded re-preparation; an unsettled subject leaves the stale run for the next sweep.

Terminal kinds are `provider-error`, `invalid-result`, `context-rejected`, `attempts-exhausted`,
`client-unavailable` and `sweep-bound-exceeded`. A terminal kind is immutable, and the run's local
outcome is persisted on every terminal write that has one. A failed attempt is terminal once the cap
is spent, when the executor marks it permanent, or when it is `context-rejected`; otherwise the lease
is released for a retry (see [the executor](../../ai-agents/classifier-runs/README.md)).

## Recovery sweep

The sweep has two discovery queries, both bounded, keyset-paginated and drained across ticks:

- **Incomplete runs** (`listIncompleteClassifierRuns`): non-terminal, non-superseded runs without
  completion. Each page enqueues the stable-id `classifier-run` job for runs whose job is gone.
- **Pending requests** (`listPendingClassifierRunRequests`): requests with no run, no settlement
  and an adapter-supplied eligibility predicate (`requestEligibility`), so a subject that never
  got a receipt is dispatched. C6 and C9 carry their embedding predicate here, so waiting for an
  embedding never spends the run's sweep bound. Each page also retires the requests the predicate
  rejected whose subject is no longer live at the requested content
  (`retireIneligibleClassifierRunRequests`), so the sweep stops re-scanning them every tick. The
  adapter's own `lockCurrent` decides: it returns the subject only while it is live, so a subject it
  returns at the requested content is merely waiting and its request stays pending, while anything
  else is settled stale for that content hash alone. Each request is judged in its own transaction
  under the subject's lock, the order every producer takes, so a retirement cannot overwrite a
  request that was just re-armed. A classifier gets this without a new hook as long as
  `lockCurrent` reflects liveness.

Only an enqueue that `addBulk` actually added counts toward `CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND`
(10). At the bound, a run is given up only once its stable-id job no longer exists, becoming
terminal `sweep-bound-exceeded`. A permanent outcome is never re-dispatched; a transient-exhausted
receipt is re-dispatched only while attempts remain. The sweep stops before enqueueing on a
spend-cap breach.

## Recovery transitions

Each failure mode below names its durable state and recovery, then the idempotency evidence.

- **Approval without a receipt**: the request row is written in the approval transaction, and the
  sweep dispatches every pending request. One request per `(classifier, subject, input hash)`.
- **Dispatch failure**: the reservation is durable before the child enqueue, and the sweep
  re-enqueues an incomplete run. Receipt identity and the stable `classifier_run_<id>` job id.
- **Provider non-consumption**: a rejected admission releases the lease; a transient failure
  retries and a permanent one ends the run. The lease token fences a later claim.
- **Provider reply or loss**: persisted outcomes are read and completed without another provider
  call. The C3 batch is pre-reserved and outcome stamps are immutable.
- **Retry and lease expiry**: a live lease delays the duplicate job, and the next claim reclaims an
  expired lease. Run id, content hash and configuration hash must all match.
- **Content or config drift**: the obsolete run is superseded and the current fingerprint is
  reserved. Supersession is durable and releases the old lease.
- **Missing configuration**: approval commits, the request stays pending and the sweep retries.
  The request stays unsettled until a run, no-work or stale settlement settles it.
- **Subject no longer eligible**: the sweep settles the request stale for that content hash, and
  re-approval or new content revives it. The settlement is scoped to the hash and made under the
  subject lock.
- **Provider client unavailable**: the remote half ends as `client-unavailable`, keeps the local
  outcome and alarms once. The terminal kind is immutable and the local outcome is insert-only.
- **Attempt cap**: the cap check ends the run as `attempts-exhausted`, and the sweep does not
  re-dispatch it. The attempt counter never decreases.
- **Sweep bound**: only jobs actually added count; at the bound, with the job gone, the run is
  given up and alarms. The counter never decreases.

## Receipt health

`readClassifierRunHealth(adapter, now, scope?)` is the one read every classifier's alarms come
from, so a new classifier is monitored by registering its adapter and adds no query. It returns, per
classifier:

- **The oldest incomplete run and the oldest pending request**, each with its age and the count
  behind it. A run is incomplete until it is complete, superseded or terminal. The request age
  ignores the adapter's eligibility predicate on purpose: a subject that waits only for its
  embedding stays pending, so a request that is old is old whatever it waits for. This is the
  signal for a Valkey enqueue that was lost after the request committed.
- **Terminal counts over a recent window**, by outcome (completed, superseded, incomplete, failed)
  and by failure kind. A missing provider key ends a run as `client-unavailable`, so it is counted
  under its own kind. The window is a lower bound on the run's time-ordered id, so the query is an
  index range and never a scan.
- **Eligible feed items with no request or run for their current content**, with a count and the
  oldest age. This is the lost-write case (#1069): a producer that never wrote the request leaves
  nothing for the two queries above to find. An adapter opts in with
  `requestsEveryEligibleFeedItem` only when its RSS upsert producer requests every eligible item (C6
  and C9); a post is requested only when it is approved or reviewed, so the post classifier is not
  asked and reports `null`. An item is counted only after a grace period, so one that is still being
  written is not reported, and the lookback is bounded so the anti-join never walks the whole table.

The worker evaluates this once on the scheduled root tick, before the spend-cap check so a parked
backlog is still seen, and never on the chained sweep pages, so one tick alarms once. A failed read
for one classifier is reported and never stops the other classifiers or the recovery sweep that
follows. Each threshold is a named constant in
[`health-thresholds.mts`](../../../../../backend/services/classifier-runs/health-thresholds.mts);
the age thresholds are set longer than the longest spend-cap parking window, so a parked run does
not alarm.

The alarm kinds are:

- `run-age`: the oldest incomplete run is older than its threshold. Throttled to once per hour.
- `request-age`: the oldest pending request is older than its threshold. Throttled to once per hour.
- `subject-unrequested`: any eligible feed item past the grace period has no request or run.
  Throttled to once per hour.
- `terminal-failures`: failed terminal runs in the window reach the threshold. Throttled to once per
  hour.
- `client-unavailable`: the provider client cannot be built, which is a missing or unusable key. Not
  throttled; it alarms at once.
- `provider-rejected`: the provider permanently rejects a run. Not throttled.
- `sweep-bound-exceeded`: a run is given up at the sweep bound, which is the re-enqueue loop alarm.
  Not throttled.

Every alarm goes through `recordClassifierRunAlarm` (`@modules/on-error`, Sentry message
`classifier_run_alarm`, fingerprinted by alarm kind and classifier so each pair is one issue). The
payload is an allowlist of identifiers, counts, ages, window lengths and failure kinds; a field
outside the allowlist is dropped before it reaches Sentry, so no prompt text, private content, API
key or raw token can ride along. The `client-unavailable` alarm carries the error name and never
the error message, which a client factory may build from its configuration.

## Usage report

`readClassifierUsageReport(window)` is the one cost, latency and fan-out read for every fixed
classifier. It adds no metrics path: provider figures come from the
[ai-usage ledger](../ai-usage/README.md), whose rows carry `classifier_run_id` and `latency_ms`
(set by the structured-decision billing hooks, so a billed response that failed strict decoding is
counted). For each run reserved in a half-open window it returns the classifier, primitive,
provider, model, prompt version, scope, batch id, shard count, retained candidate count, outcome,
attempts, retries, sweep enqueues, provider calls, tokens, priced and unpriced calls, provider cost
and latency. The same rows are summed per classifier, prompt version and scope, next to a count of
durable requests per classifier.

- **Window.** Runs are selected by reservation time, an index range on the run `id`. A ledger row is
  joined with only a lower bound, because a retry is billed after its run was reserved and can land
  after the window ends. The read refuses a window with more runs than
  [`CLASSIFIER_USAGE_REPORT_MAX_RUNS`](../../../../../backend/services/classifier-runs/usage-report-runs.mts)
  instead of cutting it short.
- **Provider calls versus local detection.** A provider call is a ledger row. A local detector (C5)
  writes no ledger row and costs nothing, so it is counted apart as a detector run with a cost of
  zero.
- **Unbilled attempts.** A request that returned no billed response (a network failure or a non-2xx
  status) writes no ledger row. It is counted as an attempt with no provider call, and it has no
  latency, because nothing is billed or measured for it.
- **Shards.** The executor makes one provider call per run, so a run has one shard today. The shard
  count is the number of decision calls persisted under the batch, and a sharded run would show one
  provider call per shard under one batch.
- **Candidates.** The candidate count is the number of results the batch retained, so a run that
  never decided retains none.
- **Diagnostic counters.** Request, sweep-enqueue and attempt counts describe work, not value, and
  are never a KPI. Queue job counts in Valkey are not durable and are not measured here.
- **No savings.** The report computes none. A before and after comparison of fan-out is the
  consumer's, from two windows of measured runs, and a figure with no measured baseline is reported
  as unmeasured.

The report is read-only. Its first consumer is the Epic C KPI check (#223); until that check lands
the function has no production caller.

## Adding a classifier

C5, C6, C7, C8 and C9 are the adapters registered today. A new classifier adds a `classifiers` row, an
adapter, an input builder for `@agents/classifier-runs`, and a registration in the worker's
classifier-run registry (a registration may add an idempotent `afterCompleted` hook for post-commit
work, as C9's story refresh does and as C6 does to dispatch C7). It adds no lifecycle code, queue, table or sweep.

## Related

- [Classifier runs agent executor](../../ai-agents/classifier-runs/README.md)
- [Post classifier service (C5 adapter)](../post-classifier/README.md)
- [Autotagger service (C6 and C7 adapters)](../autotagger/README.md)
- [Stories service (C9 adapter)](../stories/README.md)
- [Classifier persistence service](../classifiers/README.md)
- [AI agents queue](../../queues/ai-agents/README.md)
