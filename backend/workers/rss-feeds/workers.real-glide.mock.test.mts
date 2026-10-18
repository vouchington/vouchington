import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { background } from '@queues/background/queues'
import {
  RSS_FEEDS_DISPATCH_JOB,
  RSS_FEEDS_FETCH_JOB,
  type RssFeedsDispatchData,
} from '@queues/background/enqueues/rss-feeds-jobs'
import {
  deleteRssFeedsByIds,
  insertTestRssFeedDirect,
  setRssFeedOwningTopicVoteScore,
  updateRssFeedTiming,
} from '@voucha/test-helpers/entities/rss-feeds'
import { getRssFeedCrawlTiers } from '../../test-helpers/data-stores/psql/rss-feed-crawl-tiers.mts'
import { refreshMaterializedViewForTest } from '@voucha/test-helpers/refresh-materialized-view'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { rssFeedCrawlConfig } from '@services/rss-feeds/crawl-config'
import { RSS_FEEDS_ORDERING } from '@queues/rss-feeds/config'
import { rssFeedsHandlers } from './workers.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())

describe('RSS paged dispatcher through the background handler', () => {
  it('preserves the run budget and dispatcher ordering across pages', async () => {
    const feeds = await Promise.all([
      insertTestRssFeedDirect({}),
      insertTestRssFeedDirect({}),
      insertTestRssFeedDirect({}),
    ])
    const feedIds = feeds.map(feed => feed.id).toSorted()
    const restore = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
      rss_page_size: 1,
      background_max_depth: 1_000_000,
    })
    const restoreBudget = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
      capacity_budget: 2,
    })
    const dispatcher = rssFeedsHandlers.find(
      candidate => candidate.job.name === RSS_FEEDS_DISPATCH_JOB.name,
    )
    if (!dispatcher) throw new Error('RSS dispatcher handler is not registered')

    const firstJob = await background.add(RSS_FEEDS_DISPATCH_JOB.name, {
      cursor: { lane: 5, afterId: uuidBefore(feedIds[0]!) },
    })
    if (!firstJob) throw new Error('Expected RSS dispatcher job admission')
    let continuation: Awaited<ReturnType<typeof background.getJob>> | undefined
    try {
      await dispatcher.handle(firstJob as Job<never>)
      const firstPageRows = await background.searchJobs({
        name: RSS_FEEDS_FETCH_JOB.name,
        data: { rssFeedId: feedIds[0] },
      })
      expect(firstPageRows).toHaveLength(1)

      const continuations = (
        await background.searchJobs({ name: RSS_FEEDS_DISPATCH_JOB.name })
      ).filter(row => (row.data as RssFeedsDispatchData).cursor?.afterId === feedIds[0])
      expect(continuations).toHaveLength(1)
      continuation = await background.getJob(continuations[0]!.id)
      if (!continuation) throw new Error('Expected persisted RSS continuation')
      expect(continuation.data).toMatchObject({
        cursor: { lane: 5, afterId: feedIds[0] },
        asOf: expect.any(String),
        remainingBudget: 1,
      })
      expect(continuation.opts.ordering).toEqual(RSS_FEEDS_ORDERING.dispatcher)

      await dispatcher.handle(continuation as Job<never>)
      const secondPageRows = await background.searchJobs({
        name: RSS_FEEDS_FETCH_JOB.name,
        data: { rssFeedId: feedIds[1] },
      })
      expect(secondPageRows).toHaveLength(1)
      const thirdPageRows = await background.searchJobs({
        name: RSS_FEEDS_FETCH_JOB.name,
        data: { rssFeedId: feedIds[2] },
      })
      expect(thirdPageRows).toHaveLength(0)
      const furtherContinuations = (
        await background.searchJobs({ name: RSS_FEEDS_DISPATCH_JOB.name })
      ).filter(row => (row.data as RssFeedsDispatchData).cursor?.afterId === feedIds[1])
      expect(furtherContinuations).toHaveLength(0)
    } finally {
      restore()
      restoreBudget()
      await Promise.all([firstJob.remove(), continuation?.remove()])
      for (const feedId of feedIds) {
        const rows = await background.searchJobs({
          name: RSS_FEEDS_FETCH_JOB.name,
          data: { rssFeedId: feedId },
        })
        await Promise.all(rows.map(row => row.remove()))
      }
    }
  })

  it('uses scarce run capacity on a newer due feed before an older backfill feed', async () => {
    const older = await insertTestRssFeedDirect({})
    const newer = await insertTestRssFeedDirect({})
    const fillers = await Promise.all(Array.from({ length: 3 }, () => insertTestRssFeedDirect({})))
    const ownedFeedIds = [older.id, newer.id, ...fillers.map(feed => feed.id)]
    expect(older.id.localeCompare(newer.id)).toBeLessThan(0)
    const restorePage = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
      rss_page_size: 1,
      background_max_depth: 1_000_000,
    })
    const restoreBudget = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
      capacity_budget: 1,
    })
    const dispatcher = rssFeedsHandlers.find(
      candidate => candidate.job.name === RSS_FEEDS_DISPATCH_JOB.name,
    )
    if (!dispatcher) throw new Error('RSS dispatcher handler is not registered')
    let job: Awaited<ReturnType<typeof background.add>> | undefined
    try {
      // Five owned rows suffice for the top scored row to enter a tier above five even in a
      // fresh database; a tier-1 percentile would require a much larger fixture.
      await setRssFeedOwningTopicVoteScore(newer.id, 1_000_000_000, 0)
      await refreshMaterializedViewForTest('mv_rss_feed_crawl_tiers')
      const [olderTier] = await getRssFeedCrawlTiers([older.id])
      const [newerTier] = await getRssFeedCrawlTiers([newer.id])
      expect(olderTier).toBe(5)
      if (newerTier === undefined) throw new Error('Expected scored due feed crawl tier')
      expect(newerTier).toBeLessThan(5)
      // Older tier-5 feed is past tier-1 SLA but inside its own SLA: eligible backfill.
      await updateRssFeedTiming(older.id, new Date(Date.now() - 10 * 60_000))
      job = await background.add(RSS_FEEDS_DISPATCH_JOB.name, {
        cursor: { lane: newerTier, afterId: uuidBefore(older.id) },
      })
      if (!job) throw new Error('Expected RSS dispatcher job admission')
      await dispatcher.handle(job as Job<never>)
      const due = await background.searchJobs({
        name: RSS_FEEDS_FETCH_JOB.name,
        data: { rssFeedId: newer.id },
      })
      const backfill = await background.searchJobs({
        name: RSS_FEEDS_FETCH_JOB.name,
        data: { rssFeedId: older.id },
      })
      expect(due).toHaveLength(1)
      expect(backfill).toHaveLength(0)
    } finally {
      restorePage()
      restoreBudget()
      await job?.remove()
      for (const feedId of ownedFeedIds) {
        const rows = await background.searchJobs({
          name: RSS_FEEDS_FETCH_JOB.name,
          data: { rssFeedId: feedId },
        })
        await Promise.all(rows.map(row => row.remove()))
      }
      await deleteRssFeedsByIds(ownedFeedIds)
      await refreshMaterializedViewForTest('mv_rss_feed_crawl_tiers')
    }
  })
})
