import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from './plan-nodes.mts'
import { SEMANTIC_POST_CANDIDATE_LIMIT } from '@services/posts/search/query-builder/semantic-candidates'

export function assertSemanticPostCandidatePlan(result: ExplainResult): void {
  if (
    !result.scenario_id?.startsWith('post-search-semantic-') &&
    !result.scenario_id?.startsWith('post-search-hybrid-')
  )
    return
  const nodes = collectPlanNodes(result.plan)
  const candidate = nodes.find(node => node['Subplan Name'] === 'CTE semantic_post_candidates')
  if (
    !candidate ||
    candidate['Node Type'] !== 'Limit' ||
    Number(candidate['Actual Rows']) > SEMANTIC_POST_CANDIDATE_LIMIT
  ) {
    throw new Error(`${result.name} must materialize a bounded semantic candidate window`)
  }
  // Runtime forces custom plans; generic plans remain measured to expose prepared-plan regressions.
  if (result.plan_cache_mode === 'force_generic_plan') return
  const orderedVectorScan = collectPlanNodes(candidate).some(
    node =>
      node['Node Type'] === 'Index Scan' &&
      typeof node['Order By'] === 'string' &&
      node['Order By'].includes('bedrock_nova_multimodal_v1_embedding') &&
      node['Order By'].includes('<=>'),
  )
  if (!orderedVectorScan) {
    throw new Error(`${result.name} must use a distance-ordered vector index inside the window`)
  }
}
