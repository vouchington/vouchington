import type { ExplainResult } from '@data-stores/psql'
import { baseRelationName, collectPlanNodes, processedRows } from '../plan-nodes.mts'
import {
  RSS_FEED_WEEKLY_STORY_ITEM_COUNT,
  RSS_FEED_WEEKLY_WORKLOAD_ITEM_COUNT,
  RSS_FEED_WEEKLY_WORKLOAD_SOURCE_COUNT,
} from '../seed-data/rss-feed-weekly-workload.mts'
import {
  HOSTNAME_COUNT,
  RSS_FEED_ITEM_SEED_COUNT,
  RSS_FEED_SEED_COUNT,
} from '../seed-data/common.mts'

const TOTAL_RSS_ITEM_ROWS = RSS_FEED_ITEM_SEED_COUNT + RSS_FEED_WEEKLY_WORKLOAD_ITEM_COUNT + 1
const MAX_SOURCES_PER_BASE_ITEM = Math.ceil(RSS_FEED_SEED_COUNT / HOSTNAME_COUNT)
const TOTAL_RSS_SOURCE_ROWS =
  RSS_FEED_ITEM_SEED_COUNT * MAX_SOURCES_PER_BASE_ITEM + RSS_FEED_WEEKLY_WORKLOAD_ITEM_COUNT + 1
const MAX_SOURCE_MEMBERSHIP_PASSES = 2

/** Gates the single-statement personalized feed against the measured seeded item corpus. */
export function assertRssFeedPageWorkloadIsBounded(result: ExplainResult): void {
  if (!result.scenario_id?.startsWith('rss-feed-item-feed')) return
  const nodes = collectPlanNodes(result.plan)
  const rssItemsProcessed = nodes
    .filter(node => baseRelationName(node) === 'rss_feed_items')
    .reduce((sum, node) => sum + processedRows(node), 0)
  const sourcesProcessed = nodes
    .filter(node => baseRelationName(node) === 'rss_feed_item_sources')
    .reduce((sum, node) => sum + processedRows(node), 0)
  const storyProbeRows = nodes
    .filter(node => node['Alias'] === 'newer')
    .reduce((sum, node) => sum + processedRows(node), 0)
  const indexNames = new Set(
    nodes
      .map(node => (typeof node['Index Name'] === 'string' ? node['Index Name'] : ''))
      .filter(indexName => indexName.length > 0),
  )
  const joinRowsRejected = nodes.reduce(
    (sum, node) =>
      sum + Number(node['Rows Removed by Join Filter'] ?? 0) * Number(node['Actual Loops'] ?? 1),
    0,
  )

  if (rssItemsProcessed > TOTAL_RSS_ITEM_ROWS * 2)
    throw new Error(
      `${result.name} processed ${rssItemsProcessed} RSS item rows; seeded corpus contains ${TOTAL_RSS_ITEM_ROWS} items`,
    )
  if (sourcesProcessed > TOTAL_RSS_SOURCE_ROWS * MAX_SOURCE_MEMBERSHIP_PASSES)
    throw new Error(
      `${result.name} processed ${sourcesProcessed} source rows; the corpus permits ${MAX_SOURCE_MEMBERSHIP_PASSES} membership passes over ${TOTAL_RSS_SOURCE_ROWS} source links`,
    )
  const joinRejectionCeiling =
    TOTAL_RSS_ITEM_ROWS *
    MAX_SOURCES_PER_BASE_ITEM *
    RSS_FEED_WEEKLY_WORKLOAD_SOURCE_COUNT *
    MAX_SOURCE_MEMBERSHIP_PASSES
  if (joinRowsRejected > joinRejectionCeiling)
    throw new Error(
      `${result.name} rejected ${joinRowsRejected} RSS membership join rows; the corpus/follow-source cross product is at most ${joinRejectionCeiling}`,
    )
  if (storyProbeRows > RSS_FEED_WEEKLY_STORY_ITEM_COUNT * 2)
    throw new Error(
      `${result.name} examined ${storyProbeRows} newer story rows; the ${RSS_FEED_WEEKLY_STORY_ITEM_COUNT}-member skew must use an indexed winner probe`,
    )
  if (
    !/direct_deliveries\s+AS\s+NOT\s+MATERIALIZED/i.test(result.query_text) ||
    !/shared_deliveries\s+AS\s+NOT\s+MATERIALIZED/i.test(result.query_text) ||
    !/ORDER\s+BY\s+sort_at\s+DESC,\s*result_id\s+DESC/i.test(result.query_text) ||
    /candidate_(?:feed|topic)|source_limit|max_windows_per_page/i.test(result.query_text)
  ) {
    throw new Error(
      `${result.name} must be one bounded-horizon direct/share walk ordered by the UUID delivery id`,
    )
  }
  if (Number(nodes[0]?.['Actual Rows'] ?? 0) > 0) {
    if (!indexNames.has('idx_rss_feed_item_sources__item_feed'))
      throw new Error(
        `${result.name} must probe source membership through idx_rss_feed_item_sources__item_feed`,
      )
    if (
      !result.query_text.includes('search_vector @@') &&
      ![...indexNames].some(indexName => /published_at.*id/i.test(indexName))
    )
      throw new Error(`${result.name} must walk recent RSS items through a published_at/id index`)
    if (storyProbeRows > 0 && ![...indexNames].some(indexName => /story_id.*id/i.test(indexName)))
      throw new Error(`${result.name} must probe story winners through a story_id/id index`)
    if (
      result.scenario_id.includes('follow-topics') &&
      !indexNames.has('idx_rss_feed_item_categories__topic_id')
    )
      throw new Error(
        `${result.name} must probe followed categories through idx_rss_feed_item_categories__topic_id`,
      )
  }
}
