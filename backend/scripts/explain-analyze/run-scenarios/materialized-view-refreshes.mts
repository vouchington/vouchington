import { read } from '@data-stores/psql'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { TOPIC_SEED_COUNT } from '../seed-data/common.mts'
import { RSS_FEED_WEEKLY_PROXY_LISTED_TOPIC_COUNT } from '../seed-data/rss-feed-weekly-proxy.mts'
import { MATERIALIZED_VIEW_SCENARIOS } from '../materialized-view-scenarios.mts'
import { runRssDispatchScenarios } from './rss-dispatch-scenarios.mts'

const SEEDED_TOPIC_ROW_BOUND = Math.ceil(
  Math.max(TOPIC_SEED_COUNT, RSS_FEED_WEEKLY_PROXY_LISTED_TOPIC_COUNT) * 1.2,
)

export async function runMaterializedViewRefreshScenarios(): Promise<void> {
  for (const [scenarioId, view] of MATERIALIZED_VIEW_SCENARIOS) {
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
  await runRssDispatchScenarios()
}

// Baseline measurements include headroom; topic bounds also account for the proxy cohort.
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
    topics: Math.max(5259, SEEDED_TOPIC_ROW_BOUND),
    memberships: 360,
    membership_products: 5,
    membership_sources: 360,
    membership_source_states: 360,
    membership_provider_observations: 0,
    membership_provider_evidence_records: 0,
  }).map(([relation, max]) => ({ kind: 'maxProcessedRows' as const, relation, max })),
})
registerScenarioContract('mv-platform-stats-refresh', {
  expectations: [
    { kind: 'maxProcessedRows', relation: 'posts', max: 250000 },
    { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 4000 },
    {
      kind: 'maxProcessedRows',
      relation: 'topics',
      max: Math.max(6000, SEEDED_TOPIC_ROW_BOUND),
    },
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
registerScenarioContract('mv-trending-communities-refresh', {
  expectations: [{ kind: 'maxProcessedRows', relation: 'community_post_reviews', max: 200000 }],
  crossPartition: { posts: 'The post id window defines the rolling trend window.' },
})
const TREND_WINDOW = 'The relation id window defines the rolling trend window.'
registerScenarioContract('mv-trending-topics-refresh', {
  expectations: ['relation__post__category__topic', 'relation__rss_feed_item__category__topic'].map(
    relation => ({ kind: 'maxProcessedRows' as const, relation, max: 200000 }),
  ),
  crossPartition: { relation__post__category__topic: TREND_WINDOW },
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
