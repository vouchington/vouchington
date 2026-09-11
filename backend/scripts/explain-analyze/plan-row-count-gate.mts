import type { ExplainResult } from '@data-stores/psql'

export function assertPlanReturnedRows(result: ExplainResult): void {
  const rootNode = rootPlanNode(result.plan)
  const actualRows = rootNode?.['Actual Rows']
  if (typeof actualRows === 'number' && actualRows > 0) return
  if (actualRows === 0 && hasSupportDraftReservationRowEvidence(result, rootNode)) return
  throw new Error(
    `${result.name} (${result.scenario_id ?? 'unknown scenario'}) produced no analyzable plan ` +
      `with real rows (Actual Rows: ${actualRows ?? 'missing'}); every EXPLAIN ANALYZE scenario ` +
      `must exercise real seeded data`,
  )
}

function hasSupportDraftReservationRowEvidence(
  result: ExplainResult,
  rootNode: PlanNode | undefined,
): boolean {
  return (
    result.scenario_id === 'support-draft-generation-reservation' &&
    hasIndexedSupportMessageRows(rootNode)
  )
}

function hasIndexedSupportMessageRows(node: PlanNode | undefined): boolean {
  if (!node) return false
  if (
    node['Relation Name'] === 'support_messages' &&
    node['Index Name'] === 'uq_support_messages__thread_id' &&
    typeof node['Actual Rows'] === 'number' &&
    node['Actual Rows'] > 0
  ) {
    return true
  }
  const plans = node['Plans']
  return Array.isArray(plans) && plans.some(plan => hasIndexedSupportMessageRows(asPlanNode(plan)))
}

type PlanNode = Record<string, unknown>

function rootPlanNode(plan: unknown): PlanNode | undefined {
  if (plan == null || typeof plan !== 'object' || Array.isArray(plan)) return undefined
  const node = (plan as PlanNode)['Plan']
  if (node == null || typeof node !== 'object' || Array.isArray(node)) return undefined
  return node as PlanNode
}

function asPlanNode(value: unknown): PlanNode | undefined {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as PlanNode
}
