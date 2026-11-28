import { collectPlanNodes, type ExplainResult, processedRows } from '@vouchington/explain-plan'
import { baseRelationName } from '../plan-nodes.mts'

export function assertBoundedSemanticNearestPlan(
  result: ExplainResult,
  options: {
    scenarioId: string
    relation: string
    limit: number
  },
): void {
  if (result.scenario_id !== options.scenarioId) return
  const nodes = collectPlanNodes(result.plan)
  const candidate = nodes.find(node => node['Subplan Name'] === 'CTE semantic_nearest')
  if (
    !candidate ||
    candidate['Node Type'] !== 'Limit' ||
    Number(candidate['Actual Rows']) > options.limit
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
  const unboundedScan = nodes.some(
    node =>
      baseRelationName(node) === options.relation &&
      ['Seq Scan', 'Bitmap Heap Scan'].includes(String(node['Node Type'])),
  )
  if (unboundedScan) {
    throw new Error(
      `${result.name} must not fall back to a seq or bitmap scan on ${options.relation}`,
    )
  }
  const processed = nodes
    .filter(node => baseRelationName(node) === options.relation)
    .reduce((sum, node) => sum + processedRows(node), 0)
  if (processed > options.limit) {
    throw new Error(
      `${result.name} processed ${processed} rows from ${options.relation}; expected at most ${options.limit}`,
    )
  }
}
