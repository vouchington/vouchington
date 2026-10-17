import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  CACHE_PURGE_RATE_LIMIT,
  CACHE_PURGE_TAGS_JOB,
} from '@queues/background/enqueues/cache-purge-jobs'
import { getBackgroundDomainDefinition } from '@queues/background/enqueues/registry'
import { background } from '@queues/background/queues'
import { enqueueBulkPurgeCacheTags } from '@queues/cache-purge/enqueues'
import { createCachePurgeProcessor } from '../../cache-purge/processors.mts'
import { BACKGROUND_HANDLERS } from '../processors/handlers.mts'
import { createBackgroundWorker } from '../workers/create-worker.mts'

const purgeCacheTags = vi.fn<(tags: readonly string[]) => Promise<unknown>>()

// The real processor over a stub purge boundary: the real handler would call Cloudflare.
const worker = createBackgroundWorker({
  handlers: [
    ...BACKGROUND_HANDLERS.filter(handler => handler.job.domain !== 'cache-purge'),
    backgroundHandler(CACHE_PURGE_TAGS_JOB, createCachePurgeProcessor({ purgeCacheTags })),
  ],
  domains: ['cache-purge'],
})

describe('cache-purge background domain', () => {
  beforeEach(() => {
    purgeCacheTags.mockReset()
    purgeCacheTags.mockResolvedValue(undefined)
  })

  afterAll(async () => {
    await closeAndUnregisterGlideMQInstance(worker)
  })

  it('limits outbound purges to 4 per minute under Workers Cache Free-tier, across every worker', () => {
    expect(CACHE_PURGE_RATE_LIMIT).toEqual({ max: 4, duration: 60_000 })
    expect(getBackgroundDomainDefinition('cache-purge').group).toEqual({
      kind: 'domain',
      concurrency: 5,
      rateLimit: CACHE_PURGE_RATE_LIMIT,
    })
    expect(CACHE_PURGE_TAGS_JOB.options.ordering).toEqual({
      key: 'cache-purge',
      concurrency: 5,
      rateLimit: CACHE_PURGE_RATE_LIMIT,
    })
  })

  it('forwards an enqueued purge job to the cache-purge boundary', async () => {
    const tag = `post:${crypto.randomUUID()}`
    await enqueueBulkPurgeCacheTags([tag])

    expect(purgeCacheTags).toHaveBeenCalledWith([tag])
  })

  it('forwards a prioritized purge job to the cache-purge boundary', async () => {
    const tag = `post:${crypto.randomUUID()}`
    await enqueueBulkPurgeCacheTags([tag], 5)

    expect(purgeCacheTags).toHaveBeenCalledWith([tag])
  })

  it('chunks 35 tags into two jobs (30 + 5), forwarding each tag array', async () => {
    const runId = crypto.randomUUID()
    const tags = Array.from({ length: 35 }, (_, i) => `post:${runId}-${i}`)

    await enqueueBulkPurgeCacheTags(tags)

    expect(purgeCacheTags).toHaveBeenCalledTimes(2)
    expect(purgeCacheTags).toHaveBeenCalledWith(tags.slice(0, 30))
    expect(purgeCacheTags).toHaveBeenCalledWith(tags.slice(30))
  })

  it('rejects the retired single-tag queue payload', async () => {
    const tag = `post:${crypto.randomUUID()}`
    await expect(
      background.add(
        CACHE_PURGE_TAGS_JOB.name,
        { tag },
        { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 },
      ),
    ).rejects.toThrow('Cache purge job requires tags')
    expect(purgeCacheTags).not.toHaveBeenCalled()
  })

  // The shim does not enforce production dedup/debounce semantics, so the sorted-chunk dedup id
  // shape is verified against the enqueue's addBulk arguments instead of a collapsed duplicate.
  it('derives the dedup id from the sorted chunk content, not from tag order', async () => {
    const addBulkSpy = vi.spyOn(background, 'addBulk')
    try {
      const tags = [`topic:${crypto.randomUUID()}`, `post:${crypto.randomUUID()}`]

      await enqueueBulkPurgeCacheTags(tags)

      const jobs = addBulkSpy.mock.calls
        .map(
          ([entries]) =>
            entries as Array<{ name: string; data: unknown; opts?: Record<string, unknown> }>,
        )
        .find(entries => entries[0]?.name === CACHE_PURGE_TAGS_JOB.name)
      expect(
        addBulkSpy.mock.calls.filter(
          ([entries]) =>
            (entries as Array<{ name: string }>)[0]?.name === CACHE_PURGE_TAGS_JOB.name,
        ),
      ).toHaveLength(1)
      expect(jobs).toHaveLength(1)
      expect(jobs![0]!.data).toEqual({ tags })
      expect((jobs![0]!.opts?.deduplication as { id?: string } | undefined)?.id).toBe(
        `cache-purge.processPurgeCacheTag__${tags.toSorted().join(',')}`,
      )
    } finally {
      addBulkSpy.mockRestore()
    }
  })
})
