import assert from 'node:assert/strict'
import { read } from '@data-stores/psql'
import { refreshMaterializedView } from '@data-stores/psql/migration-runner/refresh-materialized-view'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { updateRssFeedTiming } from '@voucha/test-helpers/entities/rss-feeds-state'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { getRssFeedsToFetch } from '@services/rss-feeds/get-to-fetch'
import {
  getTierSlaMs,
  RSS_FEED_CRAWL_MAX_VALUES,
  rssFeedCrawlConfig,
  type RssFeedCrawlTier,
} from '@services/rss-feeds/crawl-config'
import sql from 'sql-template-strings'

const LIMIT = 10_000
const TTL_MS = 60_000
const DAY_MS = 24 * 60 * 60 * 1000
const UTC_ROLLOVERS = [
  '2024-01-31T23:59:59.999Z',
  '2024-02-01T00:00:00.001Z',
  '2024-02-29T23:59:59.999Z',
  '2024-03-01T00:00:00.001Z',
  '2024-12-31T23:59:59.999Z',
  '2025-01-01T00:00:00.001Z',
] as const

export async function checkTieredContract(ownedFeedIds: string[]): Promise<void> {
  await rssFeedCrawlConfig.waitForInitialization()
  const restoreBudget = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
    capacity_budget: RSS_FEED_CRAWL_MAX_VALUES.capacity_budget,
  })
  try {
    const neverFetched = await createTestRssFeed({})
    ownedFeedIds.push(neverFetched.id)
    const recentFetched = await createTestRssFeed({})
    ownedFeedIds.push(recentFetched.id)
    const originalRecentFetchedAt = new Date(Date.now() - TTL_MS / 2)
    await updateRssFeedTiming(recentFetched.id, originalRecentFetchedAt)

    // This is the real CONCURRENTLY refresh, outside Vitest and after CI migration.
    await refreshMaterializedView('mv_rss_feed_crawl_tiers')
    const {
      rows: [expectedTier],
    } = await read<{ crawl_tier: number; crawl_score: number }>(
      sql`/* checkRssFeedCrawlTiers.expectedTier */
        SELECT crawl_tier, crawl_score FROM mv_rss_feed_crawl_tiers
        WHERE rss_feed_id = ${recentFetched.id}
      `,
    )
    assert.ok(expectedTier, 'refreshed MV must contain the owned feed')
    assert.ok(expectedTier.crawl_tier >= 1 && expectedTier.crawl_tier <= 5)

    const initial = await getRssFeedsToFetch({ limit: LIMIT })
    assert.ok(
      initial.some(feed => feed.id === neverFetched.id),
      'never fetched must be due',
    )
    assert.ok(initial.every(feed => typeof feed.crawl_score === 'number'))
    assert.ok(initial.every(feed => feed.crawl_tier >= 1 && feed.crawl_tier <= 5))
    assert.ok(
      !initial.some(feed => feed.id === recentFetched.id),
      'recently fetched feed must miss tier-1 backfill',
    )

    for (const instant of UTC_ROLLOVERS) {
      const asOf = new Date(instant)
      try {
        await updateRssFeedTiming(recentFetched.id, new Date(asOf.getTime() - 8 * DAY_MS))
        const aged = (await getRssFeedsToFetch({ limit: LIMIT, asOf })).find(
          feed => feed.id === recentFetched.id,
        )
        assert.ok(aged, `aged owned feed must be selected at ${instant}`)
        assert.equal(aged.crawl_tier, expectedTier.crawl_tier)
        assert.equal(aged.crawl_score, expectedTier.crawl_score)
        const cutoff = asOf.getTime() - getTierSlaMs(expectedTier.crawl_tier as RssFeedCrawlTier)
        for (const delta of [-1, 0, 1] as const) {
          await updateRssFeedTiming(recentFetched.id, new Date(cutoff + delta))
          const found = (await getRssFeedsToFetch({ limit: LIMIT, asOf })).find(
            feed => feed.id === recentFetched.id,
          )
          const expectedPriorityGroup =
            delta <= 0 ? 1 : expectedTier.crawl_tier === 1 ? undefined : 2
          assert.equal(
            found?.priority_group,
            expectedPriorityGroup,
            `tier ${aged.crawl_tier} at ${instant}, SLA delta ${delta}ms`,
          )
        }
      } finally {
        await updateRssFeedTiming(recentFetched.id, originalRecentFetchedAt)
      }
    }
  } finally {
    restoreBudget()
  }
}
