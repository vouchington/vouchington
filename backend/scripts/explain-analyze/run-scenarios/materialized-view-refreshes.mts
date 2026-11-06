import { read } from '@data-stores/psql'
import { getRssFeedsToFetch } from '@services/rss-feeds/get-to-fetch'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import assert from 'node:assert/strict'

export async function runMaterializedViewRefreshScenarios(): Promise<void> {
  for (const [scenarioId, view] of [
    ['mv-top-hashtags-refresh', 'mv_top_hashtags'],
    ['mv-rss-feed-crawl-tiers-refresh', 'mv_rss_feed_crawl_tiers'],
    ['mv-platform-stats-refresh', 'mv_platform_stats'],
    ['mv-trending-rss-feeds-refresh', 'mv_trending_rss_feeds'],
    ['mv-revenue-memberships-refresh', 'mv_revenue_memberships'],
    ['mv-revenue-changes-refresh', 'mv_revenue_changes'],
  ] as const) {
    const { rows } = await read<{ definition: string }>(
      `/* explainMaterializedViewDefinition */ SELECT pg_get_viewdef($1::regclass) AS definition`,
      [view],
    )
    const definition = rows[0]?.definition
    if (!definition) throw new Error(`Missing materialized view ${view}`)
    await runAndCapture(scenarioId, async () => {
      const result = await read(`/* ${scenarioId} */ ${definition}`)
      if (result.rows.length === 0 && view !== 'mv_revenue_changes')
        throw new Error(`Empty ${view} defining query`)
      if (
        view === 'mv_top_hashtags' &&
        !result.rows.some(
          row =>
            row.display_hashtag === 'SeedHashtag' &&
            Number(row.item_count) === 120 &&
            Number(row.contributor_count) === 63,
        )
      ) {
        throw new Error(
          'Hashtag seed must include both recent branches and exclude old/back-catalogue items',
        )
      }
    })
  }
  const { rows: tierRows } = await read<{ crawl_tier: number }>(
    `/* explainRssDispatchTier */ SELECT crawl_tier FROM mv_rss_feed_crawl_tiers
     WHERE crawl_tier < 5 ORDER BY crawl_tier, rss_feed_id LIMIT 1`,
  )
  const tier = tierRows[0]?.crawl_tier
  assert.ok(tier, 'representative RSS seed must contain a non-fallback tier')
  await runAndCapture('rss-feeds-to-fetch-tiered', async () => {
    const page = await getRssFeedsToFetch({
      limit: 25,
      rawBudget: 26,
      asOf: new Date(Date.now() + 2 * 24 * 60 * 60_000),
      cursor: { lane: tier, afterId: '00000000-0000-0000-0000-000000000000' },
    })
    assert.ok(page.rawRowsRead > 0)
    assert.ok(page.feeds.length > 0)
  })
  await runAndCapture('rss-feeds-to-fetch-fallback-page', async () => {
    const page = await getRssFeedsToFetch({
      limit: 25,
      rawBudget: 26,
      cursor: { lane: 5, afterId: seedUuid(0, '08'), throughId: seedUuid(2499, '08') },
    })
    assert.equal(page.rawRowsRead, 26)
    assert.equal(page.feeds.length, 0)
    assert.equal(page.nextCursor?.lane, 5)
  })
  await runAndCapture('rss-feeds-to-fetch-fallback-tail', async () => {
    const page = await getRssFeedsToFetch({
      limit: 25,
      rawBudget: 26,
      cursor: { lane: 5, afterId: seedUuid(2000, '08'), throughId: seedUuid(2499, '08') },
    })
    assert.ok(page.feeds.length > 0)
  })
}

// Measured processed rows + 20%; both custom and generic plans must satisfy these bounds.
registerScenarioContract('mv-top-hashtags-refresh', {
  expectations: [
    { kind: 'maxProcessedRows', relation: 'posts', max: 216 },
    // Sixty hashtag-window rows plus fifty post-hydration fixtures, with 20% headroom.
    { kind: 'maxProcessedRows', relation: 'post_topic_alias_sources', max: 132 },
    { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 87 },
    { kind: 'maxProcessedRows', relation: 'rss_feed_item_categories', max: 87 },
    { kind: 'usesIndexes', indexes: ['idx_rss_feed_item_categories__rss_feed_item_id__mapped'] },
  ],
})
registerScenarioContract('mv-rss-feed-crawl-tiers-refresh', {
  expectations: Object.entries({
    // CI also seeds development feeds/topics before the EXPLAIN cohort.
    rss_feeds: 3089,
    relation__user__follow__rss_feed: 3239,
    topics: 5259,
    memberships: 360,
    membership_products: 5,
    membership_sources: 360,
    membership_source_states: 360,
    membership_provider_observations: 0,
    membership_provider_evidence_records: 0,
  }).map(([relation, max]) => ({ kind: 'maxProcessedRows' as const, relation, max })),
})
registerScenarioContract('rss-feeds-to-fetch-tiered', {
  expectations: [
    { kind: 'maxProcessedRows', relation: 'mv_rss_feed_crawl_tiers', max: 64 },
    { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 32 },
    { kind: 'maxProcessedRows', relation: 'urls', max: 32 },
    { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 32 },
    {
      kind: 'usesIndexes',
      indexes: ['rss_feeds_pkey', 'idx_rss_feeds__is_enabled'],
      anyOf: true,
      queryContains: 'getRssFeedsTiered',
    },
    { kind: 'usesIndexes', indexes: ['urls_pkey'], queryContains: 'getRssFeedsTiered' },
    { kind: 'usesIndexes', indexes: ['url_hostnames_pkey'], queryContains: 'getRssFeedsTiered' },
    {
      kind: 'usesIndexes',
      indexes: ['idx_mv_rss_feed_crawl_tiers__tier_rss_feed_id'],
      queryContains: 'getRssFeedsTiered',
    },
  ],
})
registerScenarioContract('rss-feeds-to-fetch-fallback-page', {
  expectations: [
    { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 64 },
    { kind: 'maxProcessedRows', relation: 'mv_rss_feed_crawl_tiers', max: 64 },
    { kind: 'maxProcessedRows', relation: 'urls', max: 64 },
    { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 64 },
    {
      kind: 'usesIndexes',
      indexes: ['idx_rss_feeds__is_enabled'],
      queryContains: 'getRssFeedsTiered',
    },
  ],
})
registerScenarioContract('rss-feeds-to-fetch-fallback-tail', {
  expectations: [
    { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 64 },
    { kind: 'maxProcessedRows', relation: 'mv_rss_feed_crawl_tiers', max: 64 },
    { kind: 'maxProcessedRows', relation: 'urls', max: 64 },
    { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 64 },
    { kind: 'usesIndexes', indexes: ['urls_pkey'], queryContains: 'getRssFeedsTiered' },
    { kind: 'usesIndexes', indexes: ['url_hostnames_pkey'], queryContains: 'getRssFeedsTiered' },
    {
      kind: 'usesIndexes',
      indexes: ['idx_rss_feeds__is_enabled'],
      queryContains: 'getRssFeedsTiered',
    },
  ],
})
registerScenarioContract('mv-platform-stats-refresh', {
  expectations: [
    { kind: 'maxProcessedRows', relation: 'posts', max: 250000 },
    { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 4000 },
    { kind: 'maxProcessedRows', relation: 'topics', max: 6000 },
  ],
  crossPartition: { posts: 'The snapshot counts all public posts.' },
})
registerScenarioContract('mv-trending-rss-feeds-refresh', {
  expectations: [
    { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 220000 },
    { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: 220000 },
    { kind: 'maxProcessedRows', relation: 'relation__user__follow__rss_feed', max: 12000 },
  ],
  crossPartition: { rss_feed_items: 'Publication date defines each rolling trend window.' },
})
registerScenarioContract('mv-revenue-memberships-refresh', {
  expectations: [
    { kind: 'maxProcessedRows', relation: 'memberships', max: 1000 },
    { kind: 'maxProcessedRows', relation: 'membership_source_states', max: 1000 },
  ],
})
registerScenarioContract('mv-revenue-changes-refresh', {
  expectations: [{ kind: 'maxProcessedRows', relation: 'membership_changes', max: 3000 }],
  seededRows: { membership_changes: 1 },
})
