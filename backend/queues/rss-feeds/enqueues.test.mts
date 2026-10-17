import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  RSS_FEEDS_DISPATCH_JOB,
  RSS_FEEDS_FETCH_JOB,
} from '@queues/background/enqueues/rss-feeds-jobs'
import { RSS_FEEDS_ORDERING } from './config.mts'
import { enqueueBulkFetchRssFeeds, enqueueDispatchRssFeeds } from './enqueues.mts'
import { rssFeedsQueue } from './queues.mts'
import { readAllQueueJobs } from '@voucha/test-helpers'

function isJobForRssFeed(job: { data: unknown }, rssFeedId: string): boolean {
  return (job.data as { rssFeedId?: unknown } | null | undefined)?.rssFeedId === rssFeedId
}

async function readFeedJobs(rssFeedId: string) {
  return (await readAllQueueJobs(rssFeedsQueue)).filter(job => isJobForRssFeed(job, rssFeedId))
}

describe('rss-feeds enqueues', () => {
  it('deduplicates per feed with simple mode by default', async () => {
    const rssFeedId = randomUUID()

    await enqueueBulkFetchRssFeeds([rssFeedId], { ttl: 60_000 })

    const jobs = await readFeedJobs(rssFeedId)
    expect(jobs).toHaveLength(1)
    expect(jobs?.[0]?.data).toEqual({ rssFeedId, ttl: 60_000 })
    expect(jobs?.[0]?.name).toBe('rss-feeds.fetchRssFeed')
    expect(jobs?.[0]?.opts).toMatchObject({
      priority: RSS_FEEDS_FETCH_JOB.options.priority,
      ordering: { key: 'rss-feeds', concurrency: 5 },
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

  it('keeps a requested fetch separate from the dispatcher key', async () => {
    const rssFeedId = randomUUID()

    await enqueueBulkFetchRssFeeds([rssFeedId], { ttl: 86_400_000, priority: 20 })
    await enqueueBulkFetchRssFeeds([rssFeedId], { ttl: 60_000, deduplicationScope: 'request' })
    await enqueueBulkFetchRssFeeds([rssFeedId], { ttl: 60_000, deduplicationScope: 'request' })

    const jobs = await readFeedJobs(rssFeedId)
    expect(jobs.map(job => job.opts.deduplication?.id).toSorted()).toEqual([
      `rss-feed-request__${rssFeedId}`,
      `rss-feed__${rssFeedId}`,
    ])
  })

  it('enqueues the dispatcher at dispatcher priority in its own namespaced lane', async () => {
    const job = await enqueueDispatchRssFeeds()
    expect(job).toMatchObject({
      name: RSS_FEEDS_DISPATCH_JOB.name,
      opts: { priority: 100, ordering: RSS_FEEDS_ORDERING.dispatcher },
    })
    expect(RSS_FEEDS_ORDERING.dispatcher.key).toBe('rss-feeds:dispatcher')
  })

  it('ranks a tiered fetch at the tier priority the caller names', async () => {
    const rssFeedId = randomUUID()

    await enqueueBulkFetchRssFeeds([rssFeedId], { priority: 3 })

    expect((await readFeedJobs(rssFeedId))[0]?.opts.priority).toBe(3)
  })
})
