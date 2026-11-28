import { collectPlanNodes, type ExplainResult, processedRows } from '@vouchington/explain-plan'
import { TOOLS_SEMANTIC_TOPIC_CANDIDATE_LIMIT } from '@services/topics/work-limits'
import { baseRelationName } from '../plan-nodes.mts'

export function assertToolsSemanticTopicSearchPlan(result: ExplainResult): void {
  if (result.scenario_id !== 'tools-topic-search-semantic') return
  const nodes = collectPlanNodes(result.plan)
  const candidate = nodes.find(node => node['Subplan Name'] === 'CTE semantic_nearest')
  if (
    !candidate ||
    candidate['Node Type'] !== 'Limit' ||
    Number(candidate['Actual Rows']) > TOOLS_SEMANTIC_TOPIC_CANDIDATE_LIMIT
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
  if (processed > TOOLS_SEMANTIC_TOPIC_CANDIDATE_LIMIT) {
    throw new Error(
      `${result.name} processed ${processed} rows from topics; expected at most ${TOOLS_SEMANTIC_TOPIC_CANDIDATE_LIMIT}`,
    )
  }
}
