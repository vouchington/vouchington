import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes, processedRows } from '../plan-nodes.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

export function assertReviewSuccessionCandidatePlanIfApplicable(result: ExplainResult): void {
  if (result.scenario_id !== 'review-succession-candidates') return
  const requiredRelations = new Set(['posts', 'post_review_topic_ratings'])
  const accesses = collectPlanNodes(result.plan).filter(node => {
    const relation = baseRelationName(stringFromUnknown(node['Relation Name'] ?? ''))
    return requiredRelations.has(relation)
  })
  const accessedRelations = new Set(
    accesses.map(node => baseRelationName(String(node['Relation Name']))),
  )
  const sequential = accesses.find(node => node['Node Type'] === 'Seq Scan')
  const processed = accesses.reduce((total, node) => total + processedRows(node), 0)
  if (
    [...requiredRelations].some(relation => !accessedRelations.has(relation)) ||
    sequential ||
    processed > 200
  ) {
    throw new Error(
      `${result.name} must resolve review succession candidates through indexed, bounded post and rating access`,
    )
  }
}

function baseRelationName(relation: string): string {
  return relation.replace(/__[^_].*$/, '')
}
