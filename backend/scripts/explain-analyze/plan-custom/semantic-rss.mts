import { collectPlanNodes, type ExplainResult, processedRows } from '@vouchington/explain-plan'
import { SEMANTIC_RSS_ITEM_CANDIDATE_LIMIT } from '@services/rss-feed-items/work-limits'
import { baseRelationName } from '../plan-nodes.mts'

export function assertSemanticRssSearchPlan(result: ExplainResult): void {
  if (result.scenario_id !== 'rss-feed-items-search-semantic-cursor') return
  const nodes = collectPlanNodes(result.plan)
  const candidate = nodes.find(node => node['Subplan Name'] === 'CTE semantic_nearest')
  if (
    !candidate ||
    candidate['Node Type'] !== 'Limit' ||
    Number(candidate['Actual Rows']) > SEMANTIC_RSS_ITEM_CANDIDATE_LIMIT
  ) {
    throw new Error(`${result.name} must materialize a bounded semantic_nearest prefix`)
  }
  const candidateNodes = collectPlanNodes(candidate)
  const orderedVectorScan = candidateNodes.some(
    node =>
      node['Node Type'] === 'Index Scan' &&
      typeof node['Index Name'] === 'string' &&
      node['Index Name'].includes('bedrock_nova_multimodal_v1_embedding') &&
      typeof node['Order By'] === 'string' &&
      node['Order By'].includes('bedrock_nova_multimodal_v1_embedding') &&
      node['Order By'].includes('<=>'),
  )
  if (!orderedVectorScan) {
    throw new Error(
      `${result.name} (${result.plan_cache_mode ?? 'auto'}) must use the HNSW embedding index inside semantic_nearest`,
    )
  }
  const unboundedItemScan = nodes.some(
    node =>
      baseRelationName(node) === 'rss_feed_items' &&
      ['Seq Scan', 'Bitmap Heap Scan'].includes(String(node['Node Type'])),
  )
  if (unboundedItemScan) {
    throw new Error(`${result.name} must not fall back to a seq or bitmap scan on rss_feed_items`)
  }
  const processed = nodes
    .filter(node => baseRelationName(node) === 'rss_feed_items')
    .reduce((sum, node) => sum + processedRows(node), 0)
  if (processed > SEMANTIC_RSS_ITEM_CANDIDATE_LIMIT) {
    throw new Error(
      `${result.name} processed ${processed} rows from rss_feed_items; expected at most ${SEMANTIC_RSS_ITEM_CANDIDATE_LIMIT}`,
    )
  }
}
