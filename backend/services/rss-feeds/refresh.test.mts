import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { enqueueBulkFetchRssFeeds } from '@queues/rss-feeds/enqueues'
import { rss_feeds } from '@queues/rss-feeds/queues'
import { createTestUser } from '@voucha/test-helpers'
import { refreshRssFeedAsCurrentUser } from './refresh.mts'

describe('refreshRssFeedAsCurrentUser', () => {
  it('queues a user refresh beside a low-priority dispatcher fetch and collapses repeats', async () => {
    const administrator = await createTestUser({ administrator: true })
    const rssFeedId = randomUUID()
    await enqueueBulkFetchRssFeeds([rssFeedId], { ttl: 86_400_000, priority: 20 })

    await refreshRssFeedAsCurrentUser(administrator, rssFeedId)
    await refreshRssFeedAsCurrentUser(administrator, rssFeedId)

    const jobs = await rss_feeds.searchJobs({ name: 'fetchRssFeed', data: { rssFeedId } })
    expect(jobs).toHaveLength(2)
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: { rssFeedId, ttl: 86_400_000 },
          opts: expect.objectContaining({
            priority: 20,
            deduplication: { id: `rss-feed__${rssFeedId}`, mode: 'simple' },
          }),
        }),
        expect.objectContaining({
          data: { rssFeedId, ttl: 60_000 },
          opts: expect.objectContaining({
            priority: 10,
            deduplication: { id: `rss-feed-request__${rssFeedId}`, mode: 'simple' },
          }),
        }),
      ]),
    )
  })

  it('keeps a forced refresh outside deduplication', async () => {
    const administrator = await createTestUser({ administrator: true })
    const rssFeedId = randomUUID()

    await refreshRssFeedAsCurrentUser(administrator, rssFeedId, true)
    await refreshRssFeedAsCurrentUser(administrator, rssFeedId, true)

    const jobs = await rss_feeds.searchJobs({ name: 'fetchRssFeed', data: { rssFeedId } })
    expect(jobs).toHaveLength(2)
    expect(jobs.map(job => job.data)).toEqual([
      { rssFeedId, ttl: 0 },
      { rssFeedId, ttl: 0 },
    ])
    expect(jobs.every(job => job.opts.deduplication === undefined)).toBe(true)
  })
})
