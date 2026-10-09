import { randomUUID } from 'node:crypto'
import { closeAndUnregisterGlideMQInstance, createWorker } from '@data-stores/valkey-glide-mq'
import { describe, expect, it } from 'vitest'
import { PRIORITY_DEFAULT, QUEUE_NAME } from './config.mts'
import { enqueueBulkFetchRssFeeds } from './enqueues.mts'
import { rss_feeds } from './queues.mts'
import { readAllQueueJobs } from '@voucha/test-helpers'

function isJobForRssFeed(job: { data: unknown }, rssFeedId: string): boolean {
  return (job.data as { rssFeedId?: unknown } | null | undefined)?.rssFeedId === rssFeedId
}

async function readFeedJobs(rssFeedId: string) {
  return (await readAllQueueJobs(rss_feeds)).filter(job => isJobForRssFeed(job, rssFeedId))
}

describe('rss-feeds enqueues', () => {
  it('deduplicates per feed with simple mode by default', async () => {
    const rssFeedId = randomUUID()

    await enqueueBulkFetchRssFeeds([rssFeedId], { ttl: 60_000 })

    const jobs = await readFeedJobs(rssFeedId)
    expect(jobs).toHaveLength(1)
    expect(jobs?.[0]?.data).toEqual({ rssFeedId, ttl: 60_000 })
    expect(jobs?.[0]?.opts).toMatchObject({
      priority: PRIORITY_DEFAULT,
      deduplication: { id: `rss-feed__${rssFeedId}`, mode: 'simple' },
    })
    expect(jobs?.[0]?.opts.deduplication?.ttl).toBeUndefined()
  })

  it('can skip deduplication for forced/manual refreshes', async () => {
    const rssFeedId = randomUUID()

    await enqueueBulkFetchRssFeeds([rssFeedId], {
      ttl: 0,
      skipDeduplication: true,
    })

    const jobs = await readFeedJobs(rssFeedId)
    expect(jobs).toHaveLength(1)
    expect(jobs?.[0]?.data).toEqual({ rssFeedId, ttl: 0 })
    expect(jobs?.[0]?.opts.deduplication).toBeUndefined()
  })

  it('keeps a forced refresh alongside a queued refresh for the same feed', async () => {
    const rssFeedId = randomUUID()

    await enqueueBulkFetchRssFeeds([rssFeedId], { ttl: 60_000 })
    await enqueueBulkFetchRssFeeds([rssFeedId], {
      ttl: 0,
      skipDeduplication: true,
    })

    const jobs = await readFeedJobs(rssFeedId)
    expect(jobs).toHaveLength(2)
    expect(new Set(jobs.map(job => job.id)).size).toBe(2)
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: { rssFeedId, ttl: 60_000 },
          opts: expect.objectContaining({
            deduplication: { id: `rss-feed__${rssFeedId}`, mode: 'simple' },
          }),
        }),
        expect.objectContaining({
          data: { rssFeedId, ttl: 0 },
          opts: expect.not.objectContaining({ deduplication: expect.anything() }),
        }),
      ]),
    )
  })

  it('skips a feed that is still queued, even across dispatch ticks, and re-adds it after completion', async () => {
    const queuedFeedId = randomUUID()
    const otherFeedId = randomUUID()

    await enqueueBulkFetchRssFeeds([queuedFeedId], { ttl: 60_000 })
    // Later dispatcher ticks (bulk, mixed with other feeds) must not queue the feed again.
    await enqueueBulkFetchRssFeeds([queuedFeedId, otherFeedId], { ttl: 60_000 })
    await enqueueBulkFetchRssFeeds([queuedFeedId], { ttl: 0 })

    const queuedJobs = await readFeedJobs(queuedFeedId)
    expect(queuedJobs).toHaveLength(1)
    expect(await queuedJobs[0]?.getState()).not.toBe('completed')
    expect(await readFeedJobs(otherFeedId)).toHaveLength(1)

    // A no-op stub consumer, never the real rss-feeds worker (it would fetch the network).
    const worker = createWorker(QUEUE_NAME, async () => {})
    try {
      const completed = new Promise<void>(resolve => {
        worker.on('completed', job => {
          if (job.id === queuedJobs[0]?.id) resolve()
        })
      })
      await completed
      expect(await queuedJobs[0]?.getState()).toBe('completed')

      await enqueueBulkFetchRssFeeds([queuedFeedId], { ttl: 60_000 })

      const jobs = await readFeedJobs(queuedFeedId)
      expect(jobs).toHaveLength(2)
      expect(new Set(jobs.map(job => job.id)).size).toBe(2)
    } finally {
      await closeAndUnregisterGlideMQInstance(worker)
    }
  })
})
