import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from './plan-nodes.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

const RSS_PENDING_INDEX = 'idx_rss_feed_items__story_clustering_embedding_pending'
const FIRST_POST_INDEX = 'idx_posts__created_by_id__community_id__id'
// PostgreSQL attaches the pending partial index after the existing stale-embedding (id) index.
// Its child indexes therefore use the second generated id-index name, as verified in pg_inherits.
const RSS_CHILD_INDEX = /^rss_feed_items(?:__(?:default|p_\w+)|_default)_id_idx1$/u
const POST_CHILD_INDEX =
  /^posts(?:__(?:default|p_\w+)|_default)_created_by_id_community_id_id_idx$/u

function isRelation(node: Record<string, unknown>, parent: string): boolean {
  return (
    stringFromUnknown(node['Relation Name'] ?? '') === parent ||
    stringFromUnknown(node['Relation Name'] ?? '').startsWith(`${parent}__`) ||
    stringFromUnknown(node['Relation Name'] ?? '') === `${parent}_default`
  )
}

export function assertEmbeddingReconciliationPlanIfApplicable(result: ExplainResult): void {
  if (result.scenario_id === 'rss-story-embedding-pending-late-page') {
    assertRssPendingPagePlan(result)
  }
  if (result.scenario_id === 'first-community-post-id-index') {
    assertFirstCommunityPostPlan(result)
  }
}

function assertRssPendingPagePlan(result: ExplainResult): void {
  const nodes = collectPlanNodes(result.plan)
  const scans = nodes.filter(node => isRelation(node, 'rss_feed_items'))
  const executingScans = scans.filter(node => Number(node['Actual Loops'] ?? 1) > 0)
  const usesPendingIndex = executingScans.some(
    node =>
      node['Index Name'] === RSS_PENDING_INDEX ||
      RSS_CHILD_INDEX.test(stringFromUnknown(node['Index Name'] ?? '')),
  )
  const sourceWork = scans.reduce(
    (count, node) =>
      count +
      (Number(node['Actual Rows'] ?? 0) +
        Number(node['Rows Removed by Filter'] ?? 0) +
        Number(node['Rows Removed by Index Recheck'] ?? 0)) *
        Number(node['Actual Loops'] ?? 1),
    0,
  )
  if (
    !usesPendingIndex ||
    executingScans.some(
      node =>
        !(
          (node['Index Name'] === RSS_PENDING_INDEX ||
            RSS_CHILD_INDEX.test(stringFromUnknown(node['Index Name'] ?? ''))) &&
          stringFromUnknown(node['Index Cond'] ?? '').includes('id >')
        ),
    ) ||
    !nodes.some(node => node['Node Type'] === 'Limit') ||
    nodes.some(
      node => node['Node Type'] === 'Seq Scan' || String(node['Node Type']).includes('Sort'),
    ) ||
    sourceWork > 100
  ) {
    throw new Error(
      `${result.name} must use ${RSS_PENDING_INDEX} with an id keyset bound and Limit, without sorting or sequential scanning, and read at most 100 RSS candidates; observed ${sourceWork}`,
    )
  }
}

function assertFirstCommunityPostPlan(result: ExplainResult): void {
  const nodes = collectPlanNodes(result.plan)
  const scans = nodes.filter(node => isRelation(node, 'posts'))
  if (
    !scans.some(
      node =>
        node['Index Name'] === FIRST_POST_INDEX ||
        POST_CHILD_INDEX.test(stringFromUnknown(node['Index Name'] ?? '')),
    ) ||
    scans.some(node => node['Node Type'] === 'Seq Scan') ||
    nodes.some(node => String(node['Node Type']).includes('Sort'))
  ) {
    throw new Error(
      `${result.name} must use ${FIRST_POST_INDEX} for the UUIDv7 first-post lookup without a sort or posts sequential scan`,
    )
  }
}
