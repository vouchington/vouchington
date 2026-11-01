import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import {
  RSS_FEEDS_DISPATCH_JOB,
  RSS_FEEDS_FETCH_JOB,
} from '@queues/background/enqueues/rss-feeds-jobs'
import { background } from '@queues/background/queues'
import { RSS_FEEDS_ORDERING } from '@queues/rss-feeds/config'
import { rssFeedCrawlConfig } from '@services/rss-feeds/crawl-config'
import { getRssFeedCrawlTiers } from '@voucha/test-helpers/data-stores/psql/rss-feed-crawl-tiers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  deleteRssFeedsByIds,
  insertTestRssFeedDirect,
  setRssFeedOwningTopicVoteScore,
  updateRssFeedTiming,
} from '@voucha/test-helpers/entities/rss-feeds'
import { captureRssJobs } from '@voucha/test-helpers/rss-dispatch-jobs'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { createTestUuidWindow } from '@voucha/test-helpers/uuid-window'
import { refreshMaterializedView } from '../../../data-stores/psql/migrate.mts'
import { rssFeedsHandlers } from '../workers.mts'

describe('rss feed tier lane dispatch', () => {
  // no-mistakes-timeout-reason: one crawl-tier view refresh and one real glide admission exceed the 5s default
  it('gives the single run slot to the newer due feed', { timeout: 15_000 }, async () => {
    const { firstId } = createTestUuidWindow()
    const prefix = firstId.slice(0, -1)
    const ownedIds = [1, 2, 3, 4, 5].map(digit => `${prefix}${digit}`)
    const olderId = ownedIds[0]
    const newerId = ownedIds[4]
    if (olderId === undefined || newerId === undefined) throw new Error('owned RSS feed ids')
    const feedIds: string[] = []
    let restorePage = (): void => {}
    let restoreBudget = (): void => {}
    const admitted: NonNullable<Awaited<ReturnType<typeof background.getJob>>>[] = []
    let job: Awaited<ReturnType<typeof background.add>> | undefined
    try {
      const feeds = await Promise.all(ownedIds.map(id => insertTestRssFeedDirect({ id })))
      feedIds.push(...feeds.map(feed => feed.id))
      expect(olderId.localeCompare(newerId)).toBeLessThan(0)
      restorePage = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
        rss_page_size: 1,
        background_max_depth: 1_000_000,
      })
      restoreBudget = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
        capacity_budget: 1,
      })
      const dispatcher = rssFeedsHandlers.find(
        candidate => candidate.job.name === RSS_FEEDS_DISPATCH_JOB.name,
      )
      if (!dispatcher) throw new Error('RSS dispatcher handler must be registered')

      // ast-grep-ignore: no-three-sequential-awaits -- write the score before refreshing the MV and reading its tier
      await setRssFeedOwningTopicVoteScore(newerId, 1_000_000_000, 0)
      await refreshMaterializedView('mv_rss_feed_crawl_tiers')
      const [[olderTier], [newerTier]] = await Promise.all([
        getRssFeedCrawlTiers([olderId]),
        getRssFeedCrawlTiers([newerId]),
      ])
      expect(olderTier).toBe(5)
      expect(newerTier).toBeLessThan(5)
      if (typeof newerTier !== 'number') {
        throw new Error('newer feed must land on a hotter crawl tier')
      }

      await updateRssFeedTiming(olderId, new Date(Date.now() - 10 * 60_000))
      job = await background.add(
        RSS_FEEDS_DISPATCH_JOB.name,
        {
          cursor: {
            lane: newerTier,
            afterId: uuidBefore(olderId),
            throughId: newerId,
          },
        },
        { ...RSS_FEEDS_DISPATCH_JOB.options, ordering: RSS_FEEDS_ORDERING.dispatcher },
      )
      if (!job) throw new Error('RSS dispatcher job admission')
      const admission = await captureRssJobs(
        () => dispatcher.handle(job as Job<never>),
        1,
        row =>
          row.name === RSS_FEEDS_FETCH_JOB.name &&
          feedIds.includes((row.data as { rssFeedId: string }).rssFeedId),
        row => admitted.push(row),
      )
      expect((admission.result as { count: number }).count).toBe(1)
      const due = admission.jobs.filter(
        row =>
          row.name === RSS_FEEDS_FETCH_JOB.name &&
          (row.data as { rssFeedId: string }).rssFeedId === newerId,
      )
      if (due.length !== 1) throw new Error('the newer due feed must consume the single run slot')
    } finally {
      restorePage()
      restoreBudget()
      await Promise.all([job?.remove(), ...admitted.map(row => row.remove())])
      await deleteRssFeedsByIds(feedIds)
      await refreshMaterializedView('mv_rss_feed_crawl_tiers')
    }
  })
})
