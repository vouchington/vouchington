import { collectPlanNodes, type ExplainResult, processedRows } from '@vouchington/explain-plan'
import { SEMANTIC_TOPIC_CANDIDATE_LIMIT } from '@services/topics/work-limits'
import { baseRelationName } from '../plan-nodes.mts'

// Anchor lookup via topics_pkey (1 row) plus excluding the source topic itself (t.id <> anchor, 1 row).
const SIMILAR_TOPIC_ANCHOR_ROWS = 2

const SCENARIO_EXTRA_TOPIC_ROWS: Readonly<Record<string, number>> = {
  'topic-search-semantic-cursor': 0,
  'topic-search-similar-topic': SIMILAR_TOPIC_ANCHOR_ROWS,
}

export function assertSemanticTopicSearchPlan(result: ExplainResult): void {
  const extraAnchorRows =
    result.scenario_id !== undefined ? SCENARIO_EXTRA_TOPIC_ROWS[result.scenario_id] : undefined
  if (extraAnchorRows === undefined) return
  const maxProcessed = SEMANTIC_TOPIC_CANDIDATE_LIMIT + extraAnchorRows
  const nodes = collectPlanNodes(result.plan)
  const candidate = nodes.find(node => node['Subplan Name'] === 'CTE semantic_nearest')
  const candidateNodes = candidate ? collectPlanNodes(candidate) : []
  const limitNode = candidateNodes.find(node => node['Node Type'] === 'Limit')
  if (
    !candidate ||
    !limitNode ||
    Number(candidate['Actual Rows']) > SEMANTIC_TOPIC_CANDIDATE_LIMIT ||
    Number(limitNode['Actual Rows']) > SEMANTIC_TOPIC_CANDIDATE_LIMIT
  ) {
    throw new Error(`${result.name} must materialize a bounded semantic_nearest prefix`)
  }
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
  const unboundedTopicScan = nodes.some(
    node =>
      baseRelationName(node) === 'topics' &&
      ['Seq Scan', 'Bitmap Heap Scan'].includes(String(node['Node Type'])),
  )
  if (unboundedTopicScan) {
    throw new Error(`${result.name} must not fall back to a seq or bitmap scan on topics`)
  }
  const processed = nodes
    .filter(node => baseRelationName(node) === 'topics')
    .reduce((sum, node) => sum + processedRows(node), 0)
  if (processed > maxProcessed) {
    throw new Error(
      `${result.name} processed ${processed} rows from topics; expected at most ${maxProcessed}`,
    )
  }
}
