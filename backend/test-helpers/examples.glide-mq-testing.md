# Glide-MQ Testing with TestQueue and TestWorker

The glide-mq vitest shim (`glide-mq-vitest-shim.mts`) provides `TestQueue` and `TestWorker` for in-memory testing without requiring Valkey.

## How It Works

1. **Automatic Replacement**: vitest.config.mts aliases `glide-mq` imports to the shim
2. **In-Memory Processing**: TestQueue and TestWorker use Maps instead of Redis
3. **Terminal-state drain**: `add`/`addBulk` wait until flushed job IDs complete, fail, or land on the expected DLQ, with a bounded wall-clock timeout. Nested `Queue.add` from inside a shim `Worker` processor kicks the child queue but does not wait for child completion (production `Queue.add` also returns after enqueue).
4. **Same API**: All Queue and Worker methods work identically to production, including `job.retry()` on `getJobs`/`getJob` results

## Testing Patterns

### Enqueue and Await Completion

```typescript
import { describe, it, expect } from 'vitest'
import { enqueueCreatePostEmbedding } from 'queues/bedrock-embeddings/enqueues'
import { bedrock_embeddings_nova_multimodal_v1_single } from 'queues/bedrock-embeddings/queues'

describe('Post Embeddings', () => {
  it('should enqueue embedding job', async () => {
    const postId = 'post-123'

    // Enqueue returns a promise
    await enqueueCreatePostEmbedding(postId)

    // Inspect remaining waiting jobs after enqueue returns
    const jobs = await bedrock_embeddings_nova_multimodal_v1_single.getJobs('waiting')
    expect(jobs).toHaveLength(1)
    expect(jobs[0].data.id).toBe(postId)
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
    const result = await job
    expect(result).toBeDefined()
  })
})
```

### Bulk Operations

```typescript
// Bulk enqueue works exactly like production
const jobs = []
for (let i = 0; i < 10; i++) {
  jobs.push({
    name: 'processItem',
    data: { id: `item-${i}` },
    opts: { attempts: 3 },
  })
}

await queue.addBulk(jobs)
const allJobs = await queue.getJobs('waiting')
expect(allJobs).toHaveLength(10)
```

## Key Differences from Production

| Aspect         | Production                                                     | Test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage        | Valkey (Redis)                                                 | In-memory Map                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Job Processing | Async workers                                                  | Drain waits for flushed job terminal state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Delay Option   | Respected (real delay)                                         | Accepted but ignored                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Job State      | Waiting → Active → Completed                                   | Same states; test-side add/addBulk await completion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Nested enqueue | Redis accept only                                              | Shim Worker kicks the child queue without waiting                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Concurrency    | Worker concurrency limit                                       | Capped in-memory test workers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Events         | Async events                                                   | Worker completed/failed drive the drain                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Deduplication  | `dedup: 'simple' \| 'debounce' \| 'throttle'`, all three modes | Faithful for undelayed jobs: `simple` and `throttle` match production exactly; `debounce`'s cancel-and-replace-a-delayed-job branch is unreachable here (the shim ignores `delay`/priority), so `debounce` degenerates to `simple`'s state-gating. `throttle` on a job that _did_ carry a `delay` falls back to `simple`'s state-gating too — production's throttle skips purely on elapsed time only because every real call site enqueues `delay >= ttl`, guaranteeing the referenced job can't go terminal before the window elapses; the shim ignores `delay`, so it can't rely on that invariant |
| Obliterate     | Clears queue + dedup keys + cascades to the DLQ in Redis       | `queue.obliterate({ force: true })` clears jobs, dedup state, `waitingQueue`, budgets, metrics, and schedulers, resumes a paused queue, cascades into the configured DLQ, and leaves attached workers intact                                                                                                                                                                                                                                                                                                                                                                                          |

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
2. Worker picks it up
3. Processor runs
4. Drain waits for that job ID's terminal state with a bounded wall-clock timeout

A processor that enqueues another queue (for example `topic-ratings` nesting
`entity-metrics-cache-refresh`) must not keep the parent job `active` until the
child finishes. The shim `Worker` therefore kicks nested jobs without waiting,
matching production `Queue.add`.

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
- [vitest Config](../../vitest.config.mts)
