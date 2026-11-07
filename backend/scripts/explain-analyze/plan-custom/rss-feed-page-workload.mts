import type { ExplainResult } from '@data-stores/psql'
import { STORY_POST_RELATED_URL_PROJECTION_SEED_COUNT } from '../seed-data/story-post-related-url-projection.mts'
import { baseRelationName, collectPlanNodes, processedRows } from '../plan-nodes.mts'
import { getLargeTableSeqScanRelations } from '../plan-warnings.mts'
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
const TOTAL_STORY_MEMBER_ROWS =
  RSS_FEED_WEEKLY_STORY_ITEM_COUNT + STORY_POST_RELATED_URL_PROJECTION_SEED_COUNT

/** Gates the single-statement personalized feed against the measured seeded item corpus. */
export function assertRssFeedPageWorkloadIsBounded(result: ExplainResult): void {
  if (!result.scenario_id?.startsWith('rss-feed-item-feed')) return
  const nodes = collectPlanNodes(result.plan)
  const sequentialRelations = getLargeTableSeqScanRelations(result)
  if (sequentialRelations.length)
    throw new Error(
      `${result.name} must keep the week and membership filters indexed; sequential scans: ${sequentialRelations.join(', ')}`,
    )
  const rssItemsProcessed = nodes
    .filter(node => baseRelationName(node) === 'rss_feed_items')
    .reduce((sum, node) => sum + processedRows(node), 0)
  const sourcesProcessed = nodes
    .filter(node => baseRelationName(node) === 'rss_feed_item_sources')
    .reduce((sum, node) => sum + processedRows(node), 0)
  const categoriesProcessed = nodes
    .filter(node => baseRelationName(node) === 'rss_feed_item_categories')
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
  if (categoriesProcessed > TOTAL_RSS_ITEM_ROWS * 2)
    throw new Error(
      `${result.name} processed ${categoriesProcessed} category rows; the fixture has one category per item and permits direct and newer-member probes`,
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
  if (storyProbeRows > TOTAL_STORY_MEMBER_ROWS * 2)
    throw new Error(
      `${result.name} examined ${storyProbeRows} newer story rows; the ${TOTAL_STORY_MEMBER_ROWS} members across both seeded stories must use indexed winner probes`,
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
      !nodes.some(node => {
        const indexName = node['Index Name']
        return (
          node['Alias'] === 'rss_feed_items' &&
          typeof indexName === 'string' &&
          !indexName.includes('story_id') &&
          (/^(?:idx_rss_feed_items__published_at__id|idx_rss_feed_items__media_type__published)$/.test(
            indexName,
          ) ||
            /(?:^|_)(?:media_type_)?published_at_id_idx$/.test(indexName))
        )
      })
    )
      throw new Error(`${result.name} must walk recent RSS items through a published_at/id index`)
    if (
      storyProbeRows > 0 &&
      !nodes.some(node => {
        const indexName = node['Index Name']
        return (
          node['Alias'] === 'newer' &&
          typeof indexName === 'string' &&
          (indexName === 'idx_rss_feed_items__story_id__published_at__id' ||
            /story_id_published_at_id_idx$/.test(indexName))
        )
      })
    )
      throw new Error(
        `${result.name} must probe story winners through a story_id/published_at/id index`,
      )
    if (
      result.scenario_id.includes('follow-topics') &&
      !indexNames.has('rss_feed_item_categories_pkey')
    )
      throw new Error(
        `${result.name} must probe followed categories by the item-leading rss_feed_item_categories_pkey`,
      )
  }
}
