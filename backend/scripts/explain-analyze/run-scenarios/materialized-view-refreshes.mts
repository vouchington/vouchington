import { read } from '@data-stores/psql'
import { getRssFeedsToFetch } from '@services/rss-feeds/get-to-fetch'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

export async function runMaterializedViewRefreshScenarios(): Promise<void> {
  for (const [scenarioId, view] of [
    ['mv-top-hashtags-refresh', 'mv_top_hashtags'],
    ['mv-rss-feed-crawl-tiers-refresh', 'mv_rss_feed_crawl_tiers'],
  ] as const) {
    const { rows } = await read<{ definition: string }>(
      `/* explainMaterializedViewDefinition */ SELECT pg_get_viewdef($1::regclass) AS definition`,
      [view],
    )
    const definition = rows[0]?.definition
    if (!definition) throw new Error(`Missing materialized view ${view}`)
    await runAndCapture(scenarioId, async () => {
      const result = await read(`/* ${scenarioId} */ ${definition}`)
      if (result.rows.length === 0) throw new Error(`Empty ${view} defining query`)
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
  await runAndCapture('rss-feeds-to-fetch-tiered', () => getRssFeedsToFetch())
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
    { kind: 'maxProcessedRows', relation: 'mv_rss_feed_crawl_tiers', max: 3089 },
    { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 3089 },
  ],
})
