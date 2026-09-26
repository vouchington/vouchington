import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from './plan-nodes.mts'
import { isBoundedStoryPresentationSort } from './story-presentation-sort.mts'

const PAGINATION_INDEXES_BY_SCENARIO = new Map<string, string[]>([
  ['direct-message-inbox-page', ['idx_conversations__direct_message_updated']],
  ['modmail-inbox-page', ['idx_conversations__modmail_community_updated']],
  ['individual-cards-page', ['idx_individual_cards__individual_id_id']],
  ['point-valuations-page', ['idx_ind_rp_point_valuations__individual_id_id']],
  [
    'spending-categories-page',
    ['idx_spending_entries__individual_id_id', 'idx_spending_entries__household_id_id'],
  ],
  ['rewards-program-statuses-page', ['idx_ind_rp_statuses__individual_id_id']],
  ['profile-posts-page', ['idx_relation__user__save__post__subject__newest']],
])
const RSS_FEED_ITEMS_GLOBAL_CURSOR_INDEX = 'idx_rss_feed_items__published_at__id'
const RSS_FEED_ITEMS_CHILD_INDEX_SUFFIX = '_published_at_id_idx'
const STORY_PROJECTION_SOURCE_INDEX = 'idx_rss_feed_items__story_id__id__url_id'
const STORY_PROJECTION_SOURCE_CHILD_INDEX_SUFFIX = '_story_id_id_url_id_idx'

export function assertPaginationPlanShape(result: ExplainResult): void {
  if (result.scenario_id === 'rss-feed-items-search-global-cursor') {
    assertRssFeedItemsGlobalCursorPlan(result)
    return
  }
  if (result.scenario_id === 'story-post-related-url-projection-source-page') {
    assertStoryProjectionSourcePagePlan(result)
    return
  }

  const requiredIndexes = PAGINATION_INDEXES_BY_SCENARIO.get(result.scenario_id ?? '')
  if (!requiredIndexes) return
  if (
    result.scenario_id === 'individual-cards-page' &&
    !result.query_text.includes('FROM individual_cards')
  ) {
    return
  }
  if (
    result.scenario_id === 'spending-categories-page' &&
    !result.query_text.includes('FROM spending_entries')
  ) {
    return
  }
  if (
    result.scenario_id === 'point-valuations-page' &&
    !result.query_text.includes('FROM individual_rewards_program_point_valuations')
  ) {
    return
  }
  if (
    result.scenario_id === 'rewards-program-statuses-page' &&
    !result.query_text.includes('FROM individual_rewards_program_statuses')
  ) {
    return
  }
  if (
    result.scenario_id === 'profile-posts-page' &&
    !result.query_text.includes('FROM relation__user__save__post')
  ) {
    return
  }

  const nodes = collectPlanNodes(result.plan)
  const missingIndexes = requiredIndexes.filter(
    requiredIndex => !nodes.some(node => node['Index Name'] === requiredIndex),
  )
  const explicitSort = nodes.some(node => String(node['Node Type'] ?? '').includes('Sort'))
  if (missingIndexes.length > 0 || explicitSort) {
    throw new Error(
      `${result.name} must paginate in ${requiredIndexes.join(' and ')} order without an explicit Sort`,
    )
  }
}

function assertStoryProjectionSourcePagePlan(result: ExplainResult): void {
  if (!result.query_text.includes('FROM rss_feed_items')) return

  const nodes = collectPlanNodes(result.plan)
  const usesSourceIndex = nodes.some(node => {
    const relationName = String(node['Relation Name'] ?? '')
    const indexName = String(node['Index Name'] ?? '')
    return (
      indexName === STORY_PROJECTION_SOURCE_INDEX ||
      (relationName.startsWith('rss_feed_items_') &&
        indexName.endsWith(STORY_PROJECTION_SOURCE_CHILD_INDEX_SUFFIX))
    )
  })
  const scansOrSortsSource = nodes.some(
    node =>
      (node['Node Type'] === 'Seq Scan' &&
        String(node['Relation Name'] ?? '').startsWith('rss_feed_items')) ||
      (String(node['Node Type'] ?? '').includes('Sort') &&
        !isBoundedStoryPresentationSort(node, nodes)),
  )
  if (!usesSourceIndex || scansOrSortsSource) {
    throw new Error(
      `${result.name} must page story RSS items through ${STORY_PROJECTION_SOURCE_INDEX} without an rss_feed_items sequential scan or explicit Sort: ${JSON.stringify(nodes.filter(node => String(node['Node Type']).includes('Sort') || node['Subplan Name'] === 'CTE items'))}`,
    )
  }
}

function assertRssFeedItemsGlobalCursorPlan(result: ExplainResult): void {
  if (!result.query_text.includes('FROM rss_feed_items')) return

  const nodes = collectPlanNodes(result.plan)
  const usesPublishedAtIndex = nodes.some(node => {
    const relationName = String(node['Relation Name'] ?? '')
    const indexName = String(node['Index Name'] ?? '')
    return (
      indexName === RSS_FEED_ITEMS_GLOBAL_CURSOR_INDEX ||
      (relationName.startsWith('rss_feed_items_') &&
        indexName.endsWith(RSS_FEED_ITEMS_CHILD_INDEX_SUFFIX))
    )
  })
  const scansRssFeedItems = nodes.some(
    node =>
      node['Node Type'] === 'Seq Scan' &&
      String(node['Relation Name'] ?? '').startsWith('rss_feed_items'),
  )
  if (!usesPublishedAtIndex || scansRssFeedItems) {
    throw new Error(
      `${result.name} must paginate rss_feed_items through ${RSS_FEED_ITEMS_GLOBAL_CURSOR_INDEX} without an rss_feed_items sequential scan`,
    )
  }
}
