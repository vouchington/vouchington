import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeAndUnregisterGlideMQInstance, createWorker } from '@data-stores/valkey-glide-mq'
import { CACHE_PURGE_LIMITER, QUEUE_NAME } from '@queues/cache-purge/config'
import { enqueueBulkPurgeCacheTags } from '@queues/cache-purge/enqueues'
import { cachePurge as cachePurgeQueue } from '@queues/cache-purge/queues'
import { createCachePurgeProcessor } from './processors.mts'

describe('cache-purge worker queue boundary', () => {
  const purgeCacheTags = vi.fn<(tags: readonly string[]) => Promise<unknown>>()
  let worker: { close(): Promise<void> }

  beforeEach(async () => {
    purgeCacheTags.mockReset()
    purgeCacheTags.mockResolvedValue(undefined)
    await cachePurgeQueue.obliterate({ force: true })
    worker = createWorker(QUEUE_NAME, createCachePurgeProcessor({ purgeCacheTags }))
  })

  afterEach(async () => {
    await closeAndUnregisterGlideMQInstance(worker)
  })

  it('limits outbound purges to 4 per minute under Workers Cache Free-tier', () => {
    expect(CACHE_PURGE_LIMITER).toEqual({ max: 4, duration: 60_000 })
    const workerSource = readFileSync(
      fileURLToPath(new URL('./workers.mts', import.meta.url)),
      'utf8',
    )
    expect(workerSource).toContain('limiter: CACHE_PURGE_LIMITER')
  })

  it('forwards an enqueued purge job to the cache-purge boundary', async () => {
    const tag = `post:${crypto.randomUUID()}`
    await enqueueBulkPurgeCacheTags([tag])

    expect(purgeCacheTags).toHaveBeenCalledWith([tag])
  })

  it('chunks 35 tags into two jobs (30 + 5), forwarding each tag array', async () => {
    const runId = crypto.randomUUID()
    const tags = Array.from({ length: 35 }, (_, i) => `post:${runId}-${i}`)
    const firstChunk = tags.slice(0, 30)
    const secondChunk = tags.slice(30)

    await enqueueBulkPurgeCacheTags(tags)

    expect(purgeCacheTags).toHaveBeenCalledTimes(2)
    expect(purgeCacheTags).toHaveBeenCalledWith(firstChunk)
    expect(purgeCacheTags).toHaveBeenCalledWith(secondChunk)
  })

  // Exercises the deploy-window fallback in processors.mts: a rolling ECS deploy can have an
  // old-code replica enqueue a job in the pre-batching `{ tag: string }` shape while a new-code
  // replica (this worker) is already live and reading `{ tags: string[] }`. Enqueue that legacy
  // shape directly (job.data is untyped `any` in glide-mq) to prove the worker still processes it
  // instead of silently no-oping or throwing.
  it('falls back to the legacy single-tag payload shape during a rolling deploy', async () => {
    const tag = `post:${crypto.randomUUID()}`
    await cachePurgeQueue.add(
      'processPurgeCacheTag',
      { tag },
      { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 },
    )

    expect(purgeCacheTags).toHaveBeenCalledWith([tag])
  })

  // glide-mq is aliased to the same in-memory shim noted below, which does not enforce
  // production dedup/debounce/rate-limit semantics — so the sorted-chunk dedup id shape
  // (enqueues.mts) is verified directly against addBulk's call args instead of relying on the
  // shim to actually collapse a duplicate enqueue.
  it('derives the dedup id from the sorted chunk content, not from tag order', async () => {
    const addBulkSpy = vi.spyOn(cachePurgeQueue, 'addBulk')
    const tags = [`topic:${crypto.randomUUID()}`, `post:${crypto.randomUUID()}`]

    await enqueueBulkPurgeCacheTags(tags)

    expect(addBulkSpy).toHaveBeenCalledTimes(1)
    const [jobs] = addBulkSpy.mock.calls[0] as [
      Array<{ data: unknown; opts?: Record<string, unknown> }>,
    ]
    expect(jobs).toHaveLength(1)
    expect(jobs[0].data).toEqual({ tags })
    expect((jobs[0].opts?.deduplication as { id?: string } | undefined)?.id).toBe(
      `processPurgeCacheTag__${tags.toSorted().join(',')}`,
    )

    addBulkSpy.mockRestore()
  })

  // glide-mq is aliased to an in-memory test shim for all backend tests
  // (test-helpers/vitest-config/aliases.mts) whose Queue.add() synchronously drains the
  // job through the in-process test worker and polls it to completion before resolving —
  // unlike production glide-mq, where add() only enqueues and returns before the processor
  // runs. Because this queue has no deadLetterQueue configured, the shim's poller (flushJobs)
  // rejects add()'s own promise with the processor's thrown error once the job fails.
  it('rejects when job name is unknown', async () => {
    await expect(
      cachePurgeQueue.add(
        'missingJob',
        {},
        { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 },
      ),
    ).rejects.toThrow('Cache purge job missingJob not found')
  })
})
