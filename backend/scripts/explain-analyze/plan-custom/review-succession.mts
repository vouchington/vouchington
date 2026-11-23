import {
  collectPlanNodes,
  type ExplainResult,
  type PlanNode,
  processedRows,
} from '@vouchington/explain-plan'
import { extractQueryName } from '@data-stores/psql/explain-analyze'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

export function assertReviewSuccessionCandidatePlanIfApplicable(result: ExplainResult): void {
  if (result.scenario_id !== 'review-succession-candidates') return
  const nodes = collectPlanNodes(result.plan)
  if (extractQueryName(result.query_text) === 'listReviewSuccessionHistoryPage') {
    assertHistoryPage(result, nodes)
    return
  }
  const requiredRelations = new Set(['posts', 'post_review_topic_ratings'])
  assertBoundedRelations(result, nodes, requiredRelations)
}

function assertHistoryPage(result: ExplainResult, nodes: readonly PlanNode[]): void {
  assertBoundedRelations(result, nodes, new Set(['review_successions', 'review_succession_topics']))
  const histories = nodes.filter(node => node['Relation Name'] === 'review_successions')
  const topics = nodes.filter(node => node['Relation Name'] === 'review_succession_topics')
  if (
    nodes.some(node => ['Sort', 'Incremental Sort'].includes(String(node['Node Type']))) ||
    histories.some(node => !isKeyedHistoryWalk(node)) ||
    topics.some(
      node =>
        node['Index Name'] !== 'review_succession_topics_pkey' ||
        node['Index Cond'] !== '(review_succession_id = succession.id)',
    )
  )
    throw new Error(
      `${result.name} must seek the bounded successor history interval without sorting`,
    )
}

function isKeyedHistoryWalk(node: PlanNode): boolean {
  if (!['Index Scan', 'Index Only Scan'].includes(String(node['Node Type']))) return false
  const index = node['Index Name']
  const condition = stringFromUnknown(node['Index Cond'] ?? '')
  if (/\b(?:OR|NOT)\b/.test(condition)) return false
  if (index === 'idx_review_successions__successor_post_id') {
    if (
      !condition.includes('(automatically_restored_at IS NULL)') ||
      !condition.includes('(manual_override_at IS NULL)')
    )
      return false
  } else if (index !== 'idx_review_successions__active_successor_post_id') return false
  // Match PostgreSQL's canonical EXPLAIN expression, not SQL source text. Both ends
  // must delimit the same parent, with an absolute UUID maximum as the upper id.
  const lower = condition.match(
    /ROW\(successor_post_id, id\) > ROW\(('[-0-9a-f]+'::uuid|\$\d+), ('[-0-9a-f]+'::uuid|\$\d+)\)/,
  )
  if (!lower) return false
  return condition.includes(
    `ROW(successor_post_id, id) <= ROW(${lower[1]}, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)`,
  )
}

function assertBoundedRelations(
  result: ExplainResult,
  nodes: readonly PlanNode[],
  requiredRelations: ReadonlySet<string>,
): void {
  const accesses = nodes.filter(node =>
    requiredRelations.has(baseRelationName(stringFromUnknown(node['Relation Name'] ?? ''))),
  )
  const accessedRelations = new Set(
    accesses.map(node => baseRelationName(stringFromUnknown(node['Relation Name']))),
  )
  if (
    [...requiredRelations].some(relation => !accessedRelations.has(relation)) ||
    accesses.some(node => node['Node Type'] === 'Seq Scan') ||
    accesses.reduce((total, node) => total + processedRows(node), 0) > 200
  )
    throw new Error(
      `${result.name} must resolve review succession candidates through indexed, bounded post and rating access`,
    )
}

function baseRelationName(relation: string): string {
  return relation.replace(/__[^_].*$/, '')
}
