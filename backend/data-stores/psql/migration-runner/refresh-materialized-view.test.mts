import { describe, expect, it, onTestFinished } from 'vitest'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
import {
  insertLocalTestRssFeed,
  setLocalRssFeedOwningTopicVoteScore,
  softDeleteLocalRssFeeds,
} from '../../../test-helpers/data-stores/psql/rss-feeds.mts'
import {
  getRssFeedCrawlTierAssignments,
  getRssFeedFetchStateCrawlTier,
} from '../../../test-helpers/data-stores/psql/rss-feed-crawl-tiers.mts'
import {
  isRefreshContentionError,
  refreshMaterializedViewForTest,
  runWithoutRefreshContentionForTest,
  withMaterializedViewRefreshLockHeldForTest,
} from '../../../test-helpers/refresh-materialized-view-for-test.mts'
import { refreshMaterializedView } from './refresh-materialized-view.mts'
import {
  CRAWL_TIERS_VIEW_CREATE_MARKER,
  createCrawlTiersSyncTransactionRunner,
  SYNC_RSS_FEED_FETCH_STATE_TIERS_SQL,
} from './sync-rss-feed-fetch-state-tiers.mts'

describe('refreshMaterializedView', () => {
  it('rejects a view outside the app allowlist', async () => {
    await expect(refreshMaterializedView('pg_class')).rejects.toThrow(/pg_class/)
  })

  it('rejects mv_rss_feed_crawl_tiers refresh when another refresh holds the advisory lock', async () => {
    await withMaterializedViewRefreshLockHeldForTest(async () => {
      await expect(refreshMaterializedView('mv_rss_feed_crawl_tiers')).rejects.toThrow(
        /Materialized view refresh contention; retryable/,
      )
    })
  })

  // no-mistakes-timeout-reason: refreshes mv_rss_feed_crawl_tiers twice with a rollback failure injection between refreshes
  it(
    'rolls back the mv_rss_feed_crawl_tiers refresh when the crawl_tier sync fails',
    { timeout: 15_000 },
    async () => {
      const feeds = await Promise.all(Array.from({ length: 5 }, () => insertLocalTestRssFeed()))
      const feedIds = feeds.map(feed => feed.id)
      const hotFeedId = feedIds[0]!
      onTestFinished(async () => {
        await softDeleteLocalRssFeeds(feedIds)
        await refreshMaterializedViewForTest('mv_rss_feed_crawl_tiers')
      })

      await refreshMaterializedViewForTest('mv_rss_feed_crawl_tiers')
      const initialViewTier = (await getRssFeedCrawlTierAssignments([hotFeedId])).get(hotFeedId)
      const initialStateTier = await getRssFeedFetchStateCrawlTier(hotFeedId)
      expect(initialViewTier).toBe(5)
      expect(initialStateTier).toBe(5)

      await setLocalRssFeedOwningTopicVoteScore(hotFeedId, 1_000_000_000, 0)

      const { result, error } = await runWithoutRefreshContentionForTest(() =>
        withPostgresQueryFailureForTest(
          '/* syncRssFeedFetchStateCrawlTiers */',
          () =>
            refreshMaterializedView('mv_rss_feed_crawl_tiers').catch((err: unknown) => {
              if (isRefreshContentionError(err)) throw err
              return err
            }),
          { command: 'UPDATE' },
        ),
      )
      expect(error).toMatchObject({ code: '25P02' })
      expect(result).toBe(error)

      // Failed sync must roll back the MV refresh so both stay at tier 5.
      expect((await getRssFeedCrawlTierAssignments([hotFeedId])).get(hotFeedId)).toBe(5)
      expect(await getRssFeedFetchStateCrawlTier(hotFeedId)).toBe(5)

      await runWithoutRefreshContentionForTest(() =>
        refreshMaterializedView('mv_rss_feed_crawl_tiers'),
      )
      const promotedViewTier = (await getRssFeedCrawlTierAssignments([hotFeedId])).get(hotFeedId)
      const promotedStateTier = await getRssFeedFetchStateCrawlTier(hotFeedId)
      expect(promotedViewTier).toBeLessThan(5)
      expect(promotedStateTier).toBe(promotedViewTier)
    },
  )

  it('runs crawl_tier sync inside the view transaction only when mv_rss_feed_crawl_tiers is created', async () => {
    const executed: string[] = []
    const runner = createCrawlTiersSyncTransactionRunner(async handler => {
      executed.push('BEGIN')
      const result = await handler(async input => {
        executed.push(typeof input === 'string' ? input : input.text)
        return { rows: [], rowCount: 0 } as never
      })
      executed.push('COMMIT')
      return result
    })

    await runner(async target => {
      await target('other-view-ddl')
    })
    expect(executed).toEqual(['BEGIN', 'other-view-ddl', 'COMMIT'])

    executed.length = 0
    await runner(async target => {
      await target(CRAWL_TIERS_VIEW_CREATE_MARKER)
    })
    expect(executed).toEqual([
      'BEGIN',
      CRAWL_TIERS_VIEW_CREATE_MARKER,
      SYNC_RSS_FEED_FETCH_STATE_TIERS_SQL,
      'COMMIT',
    ])
  })
})
