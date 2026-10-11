# Glide-MQ Testing with TestQueue and TestWorker

The glide-mq vitest shim (`test-helpers/glide-mq-vitest-shim.mts`) inherits glide-mq's own testing mode
(`glide-mq/testing`: `TestQueue` and `TestWorker`) for in-memory testing without Valkey. It uses
upstream priority, delay, deduplication, retry, batch, flow and dead-letter behavior, plus the same
error classes as production. The shim preserves the repository's eager enqueue and shared queue lifecycle.
`Queue` is the cached native subclass itself, so native APIs such as job logs are available without
a forwarding facade. Fixtures that manually stage records use `getOrCreateQueue(name).enqueue()`
for native admission without automatic flushing.

## How It Works

1. **Automatic Replacement**: vitest.config.mts aliases `glide-mq` imports to the shim
2. **In-Memory Processing**: TestQueue and TestWorker use Maps instead of Redis
3. **Terminal-state drain**: `add`/`addBulk` wait until flushed job IDs complete, fail, or land on the expected DLQ, with a bounded wall-clock timeout. A failed job makes `add` throw. Nested `Queue.add` from inside a shim `Worker` processor does not wait for child completion (production `Queue.add` also returns after enqueue).
4. **Native behavior, not reimplemented**: priority, delay, deduplication (`simple`, `throttle`, `debounce`), retry backoff, flows, dead-letter admission and replay, `obliterate({ force: true })`, `job.retry()` and `job.promote()` are glide-mq's own.

## What the Shim Adds

- **`add`/`addBulk` wait for the job to settle.** Production `add` returns on accept; tests need the worker's side effects. Native `addAndWait` is not used: it rejects `removeOnComplete`/`removeOnFail`, waits on one id and throws on a deduplicated add.
- **A failed flushed job throws.** A `removeOnFail: true` job is deleted before its `failed` event, but its bound native job record retains the failure. The shim reads that record without a separate failure-watcher registry.
- **Settled by events, not `Worker.drain()`.** `Worker.drain()` closes the worker, and every file in an `isolate: false` fork shares these workers.
- **Retries are promoted at once.** A retryable failure parks as `delayed` for its backoff; the shim promotes it on the queue's `retrying` event so a test does not wait out the backoff.
- **Shared store lifecycle.** `Queue.close()` leaves the fork's in-memory store and independently
  owned workers alive, just as closing a production producer leaves server state intact. Close
  workers explicitly; use `obliterate()` to clear jobs. Keeping stores registered lets native
  `TestFlowProducer` and dead-letter APIs resolve the same queues by name.
- **`addBulk` returns a compact list.** Like the released SDK, it omits deduplicated adds. Per-input test options are associated with admitted IDs before compaction, so an expected DLQ failure belongs to the correct job. Returned indices are not input indices.
- **Nested enqueue detection.** An `AsyncLocalStorage` marks processor scope so a nested `add` is not flushed.
- **Worker-attachment guard.** Fails a file that leaves an unexpected live worker attached on an `isolate: false` fork.
- **Flush timeout diagnostics.** `TestQueueFlushTimeoutError` reports worker concurrency, active counts and the stuck job's state.
- **Parked-job settlement.** Native `waitForJobs()` waits through delayed and suspended jobs and
  rejects terminal failures. The shim's event-driven flush returns when an owned job parks and
  accepts an expected failure once its native DLQ record exists. It checks bound record identity
  so removed jobs and reused IDs cannot hide a failure or inherit another job's state.
  `moveToDelayed()` wakes it through `delay-changed`.

`FlowProducer` is the native `TestFlowProducer`: `add()` returns the flow tree and parents wait for
their child dependencies. It does not apply the shim's automatic enqueue flush. For flows, replayed
jobs, or explicit terminal waits, use `queue.waitForJobs(jobs, { timeout })`; this native API waits
through delayed and suspended states and rejects failed jobs. Dead-letter reads and replay delegate
to the native queue, including source-queue ownership and `excludeData` read options.

Native `addAndWait()` owns its result wait and deadline, and replay returns after admission. Both
bypass automatic flushing when the native implementation calls `add()` internally.

Create a `Queue` or `Worker` for every referenced queue before adding a native flow;
the producer requires those stores to be registered.

The worker checks use the public API: `queue.getWorkers()` decides whether a flush has anything to wait for,
and the worker-attachment guard compares `WorkerInfo.id`s. The shim still reads these internal fields of
`glide-mq/testing`: `queue.jobs` (current record identity), `job._record` (bound state and identity),
and `queue.deadLetterQueueName` (configuration shared with the native worker),
and, for synchronous diagnostics only, `queue.workers` and `queue.waitingQueue`. Worker concurrency
and active counts use public `TestWorker` members. Re-check internal reads on every glide-mq bump; the flush tests
(`test-helpers/glide-mq-vitest-flush*.test.mts`) fail if the non-diagnostic ones change.

## Job States and Lookups

Production and test mode now agree on where a job sits:

- A job with `priority > 0` is `prioritized`. It is **not** in `getJobs('waiting')`, and `getJobCounts().waiting`
  excludes it; both report it under `delayed`. In production a fresh priority job sits in the scheduled set
  until the scheduler promotes it (about every 5 seconds), so a `waiting + active` depth check misses it.
  Read backlog depth with `getQueueBacklogDepth` (`backend/data-stores/valkey-glide-mq/get-queue-stats.mts`),
  which adds `delayed`.
- A job with `delay > 0` is `delayed` and fires on a real timer. A worker only promotes a prioritized job when
  it runs one.
- `searchJobs({ name, data })` scans every state, and `getJob(id)` is state-independent. Prefer them over
  `getJobs('waiting')`; `readAllQueueJobs` and `readEnqueuedJob` in `backend/test-helpers/queue-jobs.mts`
  wrap both.

```typescript
// Wrong: misses a prioritized job, and a worker may already have taken a plain one
const waiting = await notifications.getJobs('waiting')

// Right: any state, scoped by name and data
const jobs = await notifications.searchJobs({
  name: 'processReconcilePostNotifications',
  data: { postId },
})
```

`searchJobs` matches `data` shallowly: `data: { id }` works, a nested object or array value does not, so
filter those on the result.

### Delayed Jobs and Debounces

Do not wait out a production `delay` in a test. Release it with `promoteDelayedJobs(queue, { name, data })`
(`backend/test-helpers/queue-jobs.mts`), which promotes only jobs in state `delayed` (a prioritized job
rejects `promote()`). A flush does not wait for a delayed job, so `add` returns while it stays parked.
Promoting a `throttle` job also ends its throttle window. Production only throttles a repeat inside a
window its delay outlasts, so the repeat after the job has run is accepted there; without the release a
test's second enqueue right after the promoted job completed would return `null`.

The elections recompute is the common case: it is debounced by `ELECTIONS_DEFAULTS.recomputeDelayMs`.
`onceElectionVoteStatsCompleted` (`backend/test-helpers/election-vote-stats.mts`) releases it for you. A
service test that cannot import workers polls the observable result and calls `promoteDelayedJobs(elections,
{ name: 'processUpdateElectionVoteStats' })` inside each poll, since the enqueue is fire-and-forget and the
job may not exist yet.

### Scheduler Templates

`upsertJobScheduler` rejects `delay`, `deduplication`, `parent` and `jobId` in the template. Build template
options with `toSchedulerTemplateOptions` (`backend/modules/scheduled-job-manifest/template-options.mts`) and
keep deduplication on the job producer instead.
`backend/api/v1/mq/scheduled-job-template-validation.test.mts` fails the suite if a manifest slips one in.

## Testing Patterns

### Enqueue and Inspect

```typescript
import { describe, it, expect } from 'vitest'
import { enqueueCreatePostEmbedding } from 'queues/bedrock-embeddings/enqueues'
import { bedrock_embeddings_nova_multimodal_v1_single } from 'queues/bedrock-embeddings/queues'

describe('Post Embeddings', () => {
  it('should enqueue embedding job', async () => {
    const postId = 'post-123'

    await enqueueCreatePostEmbedding(postId)

    const jobs = await bedrock_embeddings_nova_multimodal_v1_single.searchJobs({
      data: { id: postId },
    })
    expect(jobs).toHaveLength(1)
  })
})
```

### Fire-and-Forget (Entity Listener Enqueues)

Entity listener enqueues (`enqueueOn*`) must never be `await`ed in services. They already call `.catch(onError)` internally:

```typescript
// Correct — fire-and-forget, errors handled internally
enqueueOnPostCreated(postId)

// Wrong — blocks caller on the entire inline processor chain
await enqueueOnPostCreated(postId)
```

Other enqueue functions may still be awaited if needed:

```typescript
// OK for non-entity-listener enqueues
await enqueueCreatePostEmbedding(postId)
```

### Testing Job Processing

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Worker } from 'glide-mq'

describe('Embedding Processor', () => {
  let worker: Worker

  beforeEach(() => {
    // Workers pick up jobs; add() waits until those job IDs reach a terminal state
    worker = new Worker('embeddings', processor)
  })

  afterEach(async () => {
    await worker.close()
  })

  it('should process embedding job', async () => {
    const job = await queue.add('process', { id: 'post-123' })

    // add() already waited for this job ID to finish
    expect(await queue.getJob(job!.id)).toMatchObject({ returnvalue: expect.anything() })
  })
})
```

A batch worker takes `batch: { size, timeout }` and a processor over `Job[]`. Throw `BatchError` with one
result per job to retry or fail only the jobs that threw
(`backend/workers/bloom-filters/processors/process-batch-settled.mts`).

### Bulk Operations

```typescript
const jobs = []
for (let i = 0; i < 10; i++) {
  jobs.push({
    name: 'processItem',
    data: { id: `item-${i}` },
    opts: { attempts: 3 },
  })
}

await queue.addBulk(jobs)
const allJobs = await queue.searchJobs({ name: 'processItem' })
expect(allJobs).toHaveLength(10)
```

## Key Differences from Production

| Aspect         | Production                                                  | Test                                                                                                              |
| -------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Storage        | Valkey (Redis)                                              | In-memory Map                                                                                                     |
| Job Processing | Async workers                                               | Drain waits for flushed job terminal state                                                                        |
| Delay Option   | Real delay                                                  | Real timer, same as production; a flush does not wait for it, and `promoteDelayedJobs` releases it                |
| Priority       | Promoted from the scheduled set by the scheduler (about 5s) | `prioritized` until a worker promotes it; reported under `delayed`, not `waiting`                                 |
| Job State      | Waiting → Active → Completed                                | Same states; test-side add/addBulk await completion                                                               |
| Retry backoff  | Delayed for the backoff                                     | Parked as `delayed`, then promoted by the shim at once                                                            |
| Nested enqueue | Redis accept only                                           | Shim Worker does not wait on the child                                                                            |
| Concurrency    | Worker concurrency limit                                    | Capped in-memory test workers                                                                                     |
| Events         | Async events                                                | Worker completed/failed drive the drain                                                                           |
| Deduplication  | `simple`, `debounce` and `throttle`                         | Native in 0.16, always on, all three modes                                                                        |
| Obliterate     | Clears queue + dedup keys + cascades to the DLQ in Redis    | Native `obliterate({ force: true })` (resumes a paused queue, keeps attached workers), plus the local DLQ cascade |
| Rate limiting  | `limiter` and `tokenLimiter` options                        | `tokenLimiter` is forwarded; `limiter` is accepted but not applied to the test worker                             |

## Worker Integration

Workers are started in the vitest setup (`vitest.setup.glide-mq-workers.mts`):

```typescript
import 'workers/topic-ratings/workers'
import 'workers/elections/workers'
import 'workers/entity-listeners/workers'
// etc.
```

These workers process jobs in memory during tests. The shim drain waits only
for the flushed job IDs (not queue-wide `drained`):

1. Job is added to queue
2. Worker promotes it if prioritized, then picks it up
3. Processor runs
4. Drain waits for that job ID's terminal state with a bounded wall-clock timeout

A processor that enqueues another queue (for example `topic-ratings` nesting
`entity-metrics-cache-refresh`) must not keep the parent job `active` until the
child finishes. The shim therefore does not flush a nested `add`, matching production `Queue.add`.

## No BULLMQ_INLINE_MODE Needed

Previously, tests needed `BULLMQ_INLINE_MODE` to process jobs inline. With the TestQueue/TestWorker shim, this is no longer necessary:

- ❌ **Old pattern**: Check `if (process.env.BULLMQ_INLINE_MODE)` and mock queue
- ✅ **New pattern**: Just await the promise, TestQueue handles it

```typescript
// Old approach (no longer needed)
if (process.env.BULLMQ_INLINE_MODE) {
  // inline processing
}

// New approach (always works)
await queue.add(name, data)
```

## Resources

- [Glide-MQ Testing Docs](https://github.com/avifenesh/glide-mq/blob/main/docs/TESTING.md)
- [TestQueue API](https://github.com/avifenesh/glide-mq/blob/main/docs/TESTING.md)
- [vitest Config](../../../../vitest.config.mts)
