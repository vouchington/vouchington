import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from '../plan-nodes.mts'
import { isBoundedStoryPresentationSort } from '../story-presentation-sort.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

const RSS_FEED_ITEMS_GLOBAL_CURSOR_INDEX = 'idx_rss_feed_items__published_at__id'
const RSS_FEED_ITEMS_CHILD_INDEX_SUFFIX = '_published_at_id_idx'
const STORY_PROJECTION_SOURCE_INDEX = 'idx_rss_feed_items__story_id__id__url_id'
const STORY_PROJECTION_SOURCE_CHILD_INDEX_SUFFIX = '_story_id_id_url_id_idx'
const OAUTH_CLIENT_VERIFICATION_INDEX = 'idx_oauth_clients__verified_active_id'

export function assertPaginationPlanShape(result: ExplainResult): void {
  if (result.scenario_id === 'oauth-client-verification-verified-page') {
    assertOAuthClientVerificationPlan(result)
    return
  }
  if (result.scenario_id === 'rss-feed-items-search-global-cursor') {
    assertRssFeedItemsGlobalCursorPlan(result)
    return
  }
  if (result.scenario_id === 'story-post-related-url-projection-source-page') {
    assertStoryProjectionSourcePagePlan(result)
  }
}

function assertOAuthClientVerificationPlan(result: ExplainResult): void {
  const nodes = collectPlanNodes(result.plan)
  const verifiedIndexNode = nodes.find(
    node => node['Index Name'] === OAUTH_CLIENT_VERIFICATION_INDEX,
  )
  const cursorIndexCondition = stringFromUnknown(verifiedIndexNode?.['Index Cond'] ?? '')
  const usesCursorAsIndexBound = /\bid\s*</u.test(cursorIndexCondition)
  const scansOAuthClients = nodes.some(
    node => node['Node Type'] === 'Seq Scan' && node['Relation Name'] === 'oauth_clients',
  )
  const explicitSort = nodes.some(node =>
    stringFromUnknown(node['Node Type'] ?? '').includes('Sort'),
  )
  if (!verifiedIndexNode || !usesCursorAsIndexBound || scansOAuthClients || explicitSort) {
    throw new Error(
      `${result.name} must page verified oauth_clients through ${OAUTH_CLIENT_VERIFICATION_INDEX} with the cursor in its Index Cond and without an oauth_clients sequential scan or explicit Sort`,
    )
  }
}

function assertStoryProjectionSourcePagePlan(result: ExplainResult): void {
  if (!result.query_text.includes('FROM rss_feed_items')) return

  const nodes = collectPlanNodes(result.plan)
  const usesSourceIndex = nodes.some(node => {
    const relationName = stringFromUnknown(node['Relation Name'] ?? '')
    const indexName = stringFromUnknown(node['Index Name'] ?? '')
    return (
      indexName === STORY_PROJECTION_SOURCE_INDEX ||
      (relationName.startsWith('rss_feed_items_') &&
        indexName.endsWith(STORY_PROJECTION_SOURCE_CHILD_INDEX_SUFFIX))
    )
  })
  const scansOrSortsSource = nodes.some(
    node =>
      (node['Node Type'] === 'Seq Scan' &&
        stringFromUnknown(node['Relation Name'] ?? '').startsWith('rss_feed_items')) ||
      (stringFromUnknown(node['Node Type'] ?? '').includes('Sort') &&
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
    const relationName = stringFromUnknown(node['Relation Name'] ?? '')
    const indexName = stringFromUnknown(node['Index Name'] ?? '')
    return (
      indexName === RSS_FEED_ITEMS_GLOBAL_CURSOR_INDEX ||
      (relationName.startsWith('rss_feed_items_') &&
        indexName.endsWith(RSS_FEED_ITEMS_CHILD_INDEX_SUFFIX))
    )
  })
  const scansRssFeedItems = nodes.some(
    node =>
      node['Node Type'] === 'Seq Scan' &&
      stringFromUnknown(node['Relation Name'] ?? '').startsWith('rss_feed_items'),
  )
  if (!usesPublishedAtIndex || scansRssFeedItems) {
    throw new Error(
      `${result.name} must paginate rss_feed_items through ${RSS_FEED_ITEMS_GLOBAL_CURSOR_INDEX} without an rss_feed_items sequential scan`,
    )
  }
}
