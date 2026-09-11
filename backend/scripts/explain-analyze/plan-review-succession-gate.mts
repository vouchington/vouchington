import type { ExplainResult } from '@data-stores/psql'

type PlanNode = Record<string, unknown>

export function assertReviewSuccessionCandidatePlanIfApplicable(result: ExplainResult): void {
  if (result.scenario_id !== 'review-succession-candidates') return
  const requiredRelations = new Set(['posts', 'post_review_topic_ratings'])
  const accesses = collectPlanNodes(result.plan).filter(node => {
    const relation = baseRelationName(String(node['Relation Name'] ?? ''))
    return requiredRelations.has(relation)
  })
  const accessedRelations = new Set(
    accesses.map(node => baseRelationName(String(node['Relation Name']))),
  )
  const sequential = accesses.find(node => node['Node Type'] === 'Seq Scan')
  const processed = accesses.reduce(
    (total, node) => total + Number(node['Actual Rows'] ?? 0) * Number(node['Actual Loops'] ?? 1),
    0,
  )
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

function collectPlanNodes(value: unknown, nodes: PlanNode[] = []): PlanNode[] {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return nodes
  const node = value as PlanNode
  if (typeof node['Node Type'] === 'string') nodes.push(node)
  const plans = node['Plans']
  if (Array.isArray(plans)) for (const child of plans) collectPlanNodes(child, nodes)
  collectPlanNodes(node['Plan'], nodes)
  return nodes
}
