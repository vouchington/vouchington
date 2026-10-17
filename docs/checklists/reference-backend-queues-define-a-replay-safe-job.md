# Define a replay-safe job

[Back to Backend Queue Authoring Checklist](backend-queues.md#define-a-replay-safe-job)

- Pass only durable IDs and minimal options. Read current source-of-truth state in the service instead
  of copying entities or large payloads into Valkey.
- Do not leave a credential in a retained job. When a payload must carry a value the recipient
  redeems, such as a login token whose store holds only its hash or a presigned download URL, set
  `removeOnComplete: true` and `removeOnFail: true` on those job names only. Terminal failures still
  reach `onError` from the worker's `failed` event, and `scrubJobData` redacts the value. The
  payload stays in Valkey while the job is waiting, active, or retrying, and a job that stalls past
  its limit is not removed.
- Make every processor safe to repeat. Encode correctness with an upsert, uniqueness constraint,
  content/version guard, durable sent marker, or explicit skip-if-complete check, and test that
  mechanism at the service boundary.
- Specify `attempts`, exponential `backoff` when retrying, `removeOnComplete`,
  `removeOnFail`, and an explicit `priority` on every add, bulk add, scheduler, parent, and
  child node.
- A stable custom `jobId` is a hard uniqueness key and may not contain colons, curly braces, or
  control characters. Under numeric retention (`removeOnComplete`/`removeOnFail`) GlideMQ keeps
  the claim until the terminal record is trimmed, and while the job is waiting or running, so a
  re-enqueue of the same logical id silently returns `null` instead of re-running it, and a trigger
  arriving mid-run is lost if the running job already read the old state. Before pairing a stable
  `jobId` with numeric retention, pick one: drop the custom `jobId` when `simple` or `throttle`
  deduplication already collapses the duplicates; release the claim at completion with
  `removeOnComplete`/`removeOnFail: true` (a job that stalls past its limit still keeps its id);
  time-bucket the id for periodic self-healing work with `throttle` deduplication; add an explicit
  reactivation helper (`enqueueBulkReactivatingFinished`, which removes only the finished record
  behind each skipped id) when replay must succeed on demand; or key the id by entity and triggering
  event so an overlapping sweep deduplicates while a new event is enqueued. See
  [Job Replayability](../requirements/platform/JOB-REPLAYABILITY.md).
- Choose deduplication by semantics: `throttle` for dispatchers, `debounce` only for delay-reset work
  without ordering keys, and `simple` for one-shot suppression. Deduplication never replaces
  processor idempotency.
- Measure a queue's backlog with `getQueueBacklogDepth` (`waiting + active + delayed`), not `waiting`
  alone: a fresh `priority > 0` job waits in the scheduled set until the scheduler promotes it
  and `getJobCounts()` reports it as `delayed`, so a guard on `waiting + active`
  misses it.
- Classify terminal failures with `UnrecoverableError`; translate retryable HTTP failures through the
  shared queue-error helpers. Do not swallow enqueue or child failures.
- Await, return, aggregate, or explicitly `void` every fan-out enqueue. Persist intent before fan-out,
  use stable dedupe IDs, and advance cursors or mark completion only after child enqueue/write
  success.
