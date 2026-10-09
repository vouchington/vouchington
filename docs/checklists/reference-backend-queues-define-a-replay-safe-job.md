# Define a replay-safe job

[Back to Backend Queue Authoring Checklist](backend-queues.md#define-a-replay-safe-job)

- Pass only durable IDs and minimal options. Read current source-of-truth state in the service instead
  of copying entities or large payloads into Valkey.
- Do not leave a credential in a retained job. When a payload must carry a value the recipient
  redeems, such as a login token whose store holds only its hash or a presigned download URL, set
  `removeOnComplete: true` and `removeOnFail: true` on those job names only. Terminal failures still
  reach `onError` from the worker's `failed` event, and `scrubJobData` redacts the value. The
  payload stays in Valkey while the job is waiting, active, or retrying, and a job that stalls past
  its limit is not removed (see `SECRET_BEARING_EMAIL_JOBS` in `emails`).
- Make every processor safe to repeat. Encode correctness with an upsert, uniqueness constraint,
  content/version guard, durable sent marker, or explicit skip-if-complete check, and test that
  mechanism at the service boundary.
- Specify `attempts`, exponential `backoff` when retrying, `removeOnComplete: 100`,
  `removeOnFail: 100`, and an explicit `priority` on every add, bulk add, scheduler, parent, and
  child node.
- A stable custom `jobId` is a hard uniqueness key (and may not contain colons, curly braces, or
  control characters: GlideMQ throws, so derive it from a backfill's `backfill:<id>` deduplication
  id only after replacing the colon). Under numeric retention
  (`removeOnComplete`/`removeOnFail: 100`, the default above), GlideMQ keeps that claim until the
  job's terminal record is trimmed — once 100 more jobs in the same terminal set (completed or
  failed) finish, the record drops and the id releases. Any re-enqueue of the same logical id
  before that trim silently returns `null` instead of re-running it: a bounded retention-window
  hazard, not a permanent one. The claim also holds while the job is waiting or running, when
  re-enqueue returns `null` too. A trigger arriving mid-run is lost if the running job already read
  the old state. Before pairing a stable `jobId` with numeric retention, do one of:
  drop the custom `jobId` when `simple` or `throttle` deduplication already collapses the
  duplicates you care about, because deduplication holds only while the earlier job is waiting,
  active, or retrying and releases once it is completed or failed, however it got there (see
  `extract-metadata` in `images` and the OAuth exchange dispatcher); override the default with
  `removeOnComplete`/`removeOnFail: true` to release the claim the moment the job finishes,
  accepting the loss of that job's entry in the default 100-deep terminal-job history (see
  `bluesky-follow-propagation`), noting that a job that stalls past its limit lands in the failed
  set without honoring `removeOnFail`, so its id stays claimed; time-bucket the id for periodic
  self-healing work, paired with `throttle`-mode deduplication so same-bucket retriggers collapse
  instead of colliding, and rely on the next bucket rather than an immediate re-enqueue to recover
  a miss (see `ses-inbound`'s reconciler); or, when replay must succeed on demand, pair it with an
  explicit reactivation helper that calls `job.remove()`/`job.retry()` on matching completed/failed
  jobs before re-enqueuing (see `enqueueOrReactivateBulkOAuthAuthorizationExchanges` in
  `oauth-authorization-exchange`); or key the id by the entity and triggering event, for example
  `voteWeight__<userId>__membershipExpired__<membershipId>`. An overlapping sweep that re-reads
  the same event gets the same id and deduplicates; a new event gets a new id and is enqueued.
  This guarantees each trigger is enqueued once, not that it runs. If it fails permanently,
  `removeOnFail: 100` retains it and re-adding the same id returns `null`; retrying it requires the
  reactivation option above. See [Job Replayability § Rules for New
  Jobs](../requirements/platform/reference-job-replayability-rules-for-new-jobs.md#rules-for-new-jobs).
- Choose deduplication by semantics: `throttle` for dispatchers, `debounce` only for delay-reset work
  without ordering keys, and `simple` for one-shot suppression. Deduplication never replaces
  processor idempotency.
- Measure a queue's backlog with `getQueueBacklogDepth` (`waiting + active + delayed`), not `waiting`
  alone: a fresh `priority > 0` job waits in the scheduled set until the scheduler promotes it (about
  every 5 seconds) and `getJobCounts()` reports it as `delayed`, so a guard on `waiting + active`
  misses it.
- Classify terminal failures with `UnrecoverableError`; translate retryable HTTP failures through the
  shared queue-error helpers. Do not swallow enqueue or child failures.
- Await, return, aggregate, or explicitly `void` every fan-out enqueue. Persist intent before fan-out,
  use stable dedupe IDs, and advance cursors or mark completion only after child enqueue/write
  success.
