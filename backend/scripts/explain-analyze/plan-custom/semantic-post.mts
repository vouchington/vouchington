import type { ExplainResult } from '@data-stores/psql'
import { baseRelationName, collectPlanNodes, processedRows } from '../plan-nodes.mts'
import { SEMANTIC_POST_CANDIDATE_LIMIT } from '@services/posts/search/query-builder/semantic-candidates'

// Literal bound under custom plans, parameter under generic plans.
// Window rows, their eligibility lookups and the outer lookups, with headroom for index pages.
const SEMANTIC_HOT_POSTS_BOUND = 6 * SEMANTIC_POST_CANDIDATE_LIMIT

const SEMANTIC_TIME_BOUND = /\bid >= (?:'[0-9a-f-]{36}'::uuid|\$\d+)/

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
  const candidateNodes = new Set(collectPlanNodes(candidate))
  const unboundedOuterPostScan = nodes.some(
    node =>
      !candidateNodes.has(node) &&
      /^posts(?:_|$)/.test(String(node['Relation Name'])) &&
      ['Seq Scan', 'Bitmap Heap Scan'].includes(String(node['Node Type'])),
  )
  if (unboundedOuterPostScan) {
    throw new Error(`${result.name} must look up outer posts from the bounded candidates`)
  }
  if (result.scenario_id?.endsWith('-1m')) {
    const bounded = collectPlanNodes(candidate).some(
      node =>
        /^posts(?:_|$)/.test(String(node['Relation Name'])) &&
        [node.Filter, node['Index Cond'], node['Recheck Cond']].some(
          condition => typeof condition === 'string' && SEMANTIC_TIME_BOUND.test(condition),
        ),
    )
    if (!bounded) {
      throw new Error(`${result.name} must bound the candidate posts scan by the time range`)
    }
    // A narrow window may correctly use an exact sort, so only record which path the planner took.
    const types = [...new Set(collectPlanNodes(candidate).map(node => String(node['Node Type'])))]
    console.log(
      `${result.name}: ${result.plan_cache_mode ?? 'default'} candidate plan nodes ${types.join(', ')}`,
    )
    return
  }
  // Runtime forces custom plans; generic plans remain measured to expose prepared-plan regressions.
  if (result.plan_cache_mode === 'force_generic_plan') return
  const orderedVectorScan = collectPlanNodes(candidate).some(
    node =>
      node['Node Type'] === 'Index Scan' &&
      typeof node['Order By'] === 'string' &&
      node['Order By'].includes('gemini_embedding_2_embedding') &&
      node['Order By'].includes('<=>'),
  )
  if (!orderedVectorScan) {
    throw new Error(`${result.name} must use a distance-ordered vector index inside the window`)
  }
  if (result.scenario_id?.endsWith('-hot')) {
    // Net votes filter the bounded window outside the vector walk; inside it most neighbours
    // would be rejected until hnsw.max_scan_tuples.
    const processed = nodes
      .filter(node => baseRelationName(node) === 'posts')
      .reduce((sum, node) => sum + processedRows(node), 0)
    console.log(`${result.name}: processed ${processed} rows from posts`)
    if (processed > SEMANTIC_HOT_POSTS_BOUND) {
      throw new Error(
        `${result.name} processed ${processed} rows from posts; expected at most ${SEMANTIC_HOT_POSTS_BOUND}`,
      )
    }
  }
}
