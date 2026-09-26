import type { ExplainResult } from '@data-stores/psql'

export function assertPlanReturnedRows(result: ExplainResult): void {
  const rootNode = rootPlanNode(result.plan)
  const actualRows = rootNode?.['Actual Rows']
  if (typeof actualRows === 'number' && actualRows > 0) return
  throw new Error(
    `${result.name} (${result.scenario_id ?? 'unknown scenario'}) produced no analyzable plan ` +
      `with real rows (Actual Rows: ${actualRows ?? 'missing'}); every EXPLAIN ANALYZE scenario ` +
      `must exercise real seeded data`,
  )
}

type PlanNode = Record<string, unknown>

function rootPlanNode(plan: unknown): PlanNode | undefined {
  if (plan == null || typeof plan !== 'object' || Array.isArray(plan)) return undefined
  const node = (plan as PlanNode)['Plan']
  if (node == null || typeof node !== 'object' || Array.isArray(node)) return undefined
  return node as PlanNode
}
