import assert from 'node:assert/strict'
import { read } from '@data-stores/psql'
import { refreshMaterializedView } from '@data-stores/psql/migration-runner/refresh-materialized-view'
import { countEnabledRssFeedsForTest } from '@voucha/test-helpers/sql-rss-feeds'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { updateRssFeedTiming } from '@voucha/test-helpers/entities/rss-feeds-state'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { getRssFeedsToFetch, type RssFeedDispatchCandidate } from '@services/rss-feeds/get-to-fetch'
import { updateRssFeedById } from '@services/rss-feeds/update'
import {
  getCrawlCapacityBudget,
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

async function collectTieredFeeds(
  options: { limit?: number; asOf?: Date } = {},
): Promise<RssFeedDispatchCandidate[]> {
  const budget = Math.min(options.limit ?? getCrawlCapacityBudget(), getCrawlCapacityBudget())
  const feeds: RssFeedDispatchCandidate[] = []
  let cursor: { lane: number; afterId: string } | undefined
  let pages = 0
  do {
    const page = await getRssFeedsToFetch({
      ...options,
      ...(cursor && { cursor }),
      limit: budget - feeds.length,
    })
    feeds.push(...page.feeds)
    cursor = page.nextCursor
    if (++pages > 1_000) throw new Error('RSS tier contract exceeded its fixture page budget')
  } while (cursor && feeds.length < budget)
  return feeds
}

export async function checkTieredContract(ownedFeedIds: string[]): Promise<void> {
  await rssFeedCrawlConfig.waitForInitialization()
  const restoreBudget = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
    capacity_budget: RSS_FEED_CRAWL_MAX_VALUES.capacity_budget,
    selection_scan_page_size: RSS_FEED_CRAWL_MAX_VALUES.selection_scan_page_size,
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

    const restoreTwo = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
      capacity_budget: 2,
    })
    try {
      assert.ok((await collectTieredFeeds()).length <= 2, 'capacity budget must cap results')
    } finally {
      restoreTwo()
    }

    const initial = await collectTieredFeeds({ limit: LIMIT })
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

    await updateRssFeedById(neverFetched.id, { declared_language: 'fr' })
    try {
      const feeds = await collectTieredFeeds({ limit: LIMIT })
      assert.equal(feeds.find(feed => feed.id === neverFetched.id)?.declared_language, 'fr')
    } finally {
      await updateRssFeedById(neverFetched.id, { declared_language: null })
    }

    await updateRssFeedById(neverFetched.id, { should_ignore_robots_txt: false })
    try {
      const feeds = await collectTieredFeeds({ limit: LIMIT })
      assert.equal(feeds.find(feed => feed.id === neverFetched.id)?.feed_ignore_robots_txt, false)
    } finally {
      await updateRssFeedById(neverFetched.id, { should_ignore_robots_txt: null })
    }

    await updateRssFeedById(neverFetched.id, { unreliable_status_codes: [404, 410] })
    try {
      const feeds = await collectTieredFeeds({ limit: LIMIT })
      assert.deepEqual(
        feeds.find(feed => feed.id === neverFetched.id)?.feed_unreliable_status_codes,
        [404, 410],
      )
    } finally {
      await updateRssFeedById(neverFetched.id, { unreliable_status_codes: null })
    }

    for (const instant of UTC_ROLLOVERS) {
      const asOf = new Date(instant)
      try {
        await updateRssFeedTiming(recentFetched.id, new Date(asOf.getTime() - 8 * DAY_MS))
        // no-mistakes-disable-next-line query-reached-per-item: fixed UTC rollover fixtures each verify one bounded tier page after its own timing mutation.
        const aged = (await collectTieredFeeds({ limit: LIMIT, asOf })).find(
          feed => feed.id === recentFetched.id,
        )
        assert.ok(aged, `aged owned feed must be selected at ${instant}`)
        assert.equal(aged.crawl_tier, expectedTier.crawl_tier)
        assert.equal(aged.crawl_score, expectedTier.crawl_score)
        const cutoff = asOf.getTime() - getTierSlaMs(expectedTier.crawl_tier as RssFeedCrawlTier)
        for (const delta of [-1, 0, 1] as const) {
          await updateRssFeedTiming(recentFetched.id, new Date(cutoff + delta))
          // no-mistakes-disable-next-line query-reached-per-item: three fixed SLA boundary mutations each require a separate capped tier read.
          const found = (await collectTieredFeeds({ limit: LIMIT, asOf })).find(
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

    // A feed created after refresh has no MV row; LEFT JOIN must still dispatch tier 5.
    const newFeed = await createTestRssFeed({})
    ownedFeedIds.push(newFeed.id)
    const { rows: missingTier } = await read<{ rss_feed_id: string }>(
      sql`/* checkRssFeedCrawlTiers.missingTier */
        SELECT rss_feed_id FROM mv_rss_feed_crawl_tiers WHERE rss_feed_id = ${newFeed.id}
      `,
    )
    assert.deepEqual(missingTier, [], 'new owned feed must have no MV row before refresh')
    const restoreFallbackBudget = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
      capacity_budget: (await countEnabledRssFeedsForTest()) + 100,
    })
    try {
      const found = (await collectTieredFeeds({ limit: LIMIT })).find(
        feed => feed.id === newFeed.id,
      )
      assert.ok(found, 'new feed absent from MV must be dispatched')
      assert.equal(found.crawl_tier, 5)
      assert.equal(found.crawl_score, 0)
    } finally {
      restoreFallbackBudget()
    }
  } finally {
    restoreBudget()
  }
}
