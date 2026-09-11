# Define a replay-safe job

[Back to Backend Queue Authoring Checklist](backend-queues.md#define-a-replay-safe-job)

- Pass only durable IDs and minimal options. Read current source-of-truth state in the service instead
  of copying entities or large payloads into Valkey.
- Make every processor safe to repeat. Encode correctness with an upsert, uniqueness constraint,
  content/version guard, durable sent marker, or explicit skip-if-complete check, and test that
  mechanism at the service boundary.
- Specify `attempts`, exponential `backoff` when retrying, `removeOnComplete: 100`,
  `removeOnFail: 100`, and an explicit `priority` on every add, bulk add, scheduler, parent, and
  child node.
- A stable custom `jobId` is a hard uniqueness key. Under numeric retention
  (`removeOnComplete`/`removeOnFail: 100`, the default above), GlideMQ keeps that claim until the
  job's terminal record is trimmed — once 100 more jobs in the same terminal set (completed or
  failed) finish, the record drops and the id releases. Any re-enqueue of the same logical id
  before that trim silently returns `null` instead of re-running it: a bounded retention-window
  hazard, not a permanent one. Before pairing a stable `jobId` with numeric retention, do one of:
  override the default with `removeOnComplete`/`removeOnFail: true` to release the claim the
  moment the job finishes, accepting the loss of that job's entry in the default 100-deep
  terminal-job history (see `bluesky-follow-propagation`); time-bucket the id for periodic
  self-healing work, paired with `throttle`-mode deduplication so same-bucket retriggers collapse
  instead of colliding, and rely on the next bucket rather than an immediate re-enqueue to recover
  a miss (see `ses-inbound`'s reconciler); or, when replay must succeed on demand, pair it with an
  explicit reactivation helper that calls `job.remove()`/`job.retry()` on matching completed/failed
  jobs before re-enqueuing (see `enqueueOrReactivateBulkOAuthAuthorizationExchanges` in
  `oauth-authorization-exchange`). See [Job Replayability § Rules for New
  Jobs](../requirements/platform/reference-job-replayability-rules-for-new-jobs.md#rules-for-new-jobs).
- Choose deduplication by semantics: `throttle` for dispatchers, `debounce` only for delay-reset work
  without ordering keys, and `simple` for one-shot suppression. Deduplication never replaces
  processor idempotency.
- Classify terminal failures with `UnrecoverableError`; translate retryable HTTP failures through the
  shared queue-error helpers. Do not swallow enqueue or child failures.
- Await, return, aggregate, or explicitly `void` every fan-out enqueue. Persist intent before fan-out,
  use stable dedupe IDs, and advance cursors or mark completion only after child enqueue/write
  success.
