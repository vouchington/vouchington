import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { PRIORITY_DEFAULT, RSS_FEEDS_DEFAULTS } from './config.mts'
import { enqueueBulkFetchRssFeeds } from './enqueues.mts'
import { rss_feeds } from './queues.mts'

function isJobForRssFeed(job: { data: unknown }, rssFeedId: string): boolean {
  return (job.data as { rssFeedId?: unknown } | null | undefined)?.rssFeedId === rssFeedId
}

describe('rss-feeds enqueues', () => {
  it('uses short throttle deduplication by default', async () => {
    const rssFeedId = randomUUID()

    await enqueueBulkFetchRssFeeds([rssFeedId], { ttl: 60_000 })

    const jobs = (await rss_feeds.getJobs('waiting')).filter(job => isJobForRssFeed(job, rssFeedId))
    expect(jobs).toHaveLength(1)
    expect(jobs?.[0]?.data).toEqual({ rssFeedId, ttl: 60_000 })
    expect(jobs?.[0]?.opts).toMatchObject({
      priority: PRIORITY_DEFAULT,
      deduplication: {
        id: `rss-feed__${rssFeedId}`,
        mode: 'throttle',
        ttl: RSS_FEEDS_DEFAULTS.deduplicationTtlMs,
      },
    })
  })

  it('can skip deduplication for forced/manual refreshes', async () => {
    const rssFeedId = randomUUID()

    await enqueueBulkFetchRssFeeds([rssFeedId], {
      ttl: 0,
      skipDeduplication: true,
    })

    const jobs = (await rss_feeds.getJobs('waiting')).filter(job => isJobForRssFeed(job, rssFeedId))
    expect(jobs).toHaveLength(1)
    expect(jobs?.[0]?.data).toEqual({ rssFeedId, ttl: 0 })
    expect(jobs?.[0]?.opts.deduplication).toBeUndefined()
  })

  it('keeps a forced refresh alongside a throttled refresh for the same feed', async () => {
    const rssFeedId = randomUUID()

    await enqueueBulkFetchRssFeeds([rssFeedId], { ttl: 60_000 })
    await enqueueBulkFetchRssFeeds([rssFeedId], {
      ttl: 0,
      skipDeduplication: true,
    })

    const jobs = (await rss_feeds.getJobs('waiting')).filter(job => isJobForRssFeed(job, rssFeedId))
    expect(jobs).toHaveLength(2)
    expect(new Set(jobs.map(job => job.id)).size).toBe(2)
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: { rssFeedId, ttl: 60_000 },
          opts: expect.objectContaining({
            deduplication: {
              id: `rss-feed__${rssFeedId}`,
              mode: 'throttle',
              ttl: RSS_FEEDS_DEFAULTS.deduplicationTtlMs,
            },
          }),
        }),
        expect.objectContaining({
          data: { rssFeedId, ttl: 0 },
          opts: expect.not.objectContaining({ deduplication: expect.anything() }),
        }),
      ]),
    )
  })
})
