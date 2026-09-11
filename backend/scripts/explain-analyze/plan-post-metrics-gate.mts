import type { ExplainResult } from '@data-stores/psql'

const POST_METRICS_SCENARIO = 'post-metrics-batch'
const SOURCE_ROW_CEILINGS = new Map<string, number>([
  ['posts', 10_000],
  ['relation__user__follow__post', 1_000],
  ['relation__user__save__post', 1_000],
])

type PlanNode = Record<string, unknown>

export function assertPostMetricsBatchIsCandidateBounded(result: ExplainResult): void {
  if (result.scenario_id !== POST_METRICS_SCENARIO) return

  if (!/\brequested_posts\b/.test(result.query_text)) {
    throw new Error(
      `${result.name} (${result.scenario_id}) must constrain metric sources through requested_posts`,
    )
  }

  const nodes = collectPlanNodes(result.plan)
  if (
    nodes.some(
      node =>
        String(node['Subplan Name'] ?? '').startsWith('SubPlan') &&
        String(node['Node Type'] ?? '').includes('Aggregate'),
    )
  ) {
    throw new Error(
      `${result.name} (${result.scenario_id}) must not execute correlated metric SubPlans`,
    )
  }

  const processedRowsByRelation = new Map<string, number>()
  for (const node of nodes) {
    const relationName = baseRelationName(node)
    if (!SOURCE_ROW_CEILINGS.has(relationName)) continue
    const actualRows = Number(node['Actual Rows'] ?? 0)
    const actualLoops = Number(node['Actual Loops'] ?? 1)
    const removedRows =
      Number(node['Rows Removed by Filter'] ?? 0) +
      Number(node['Rows Removed by Index Recheck'] ?? 0)
    const processedRows = (actualRows + removedRows) * actualLoops
    processedRowsByRelation.set(
      relationName,
      (processedRowsByRelation.get(relationName) ?? 0) + processedRows,
    )
  }

  for (const [relationName, processedRows] of processedRowsByRelation) {
    const ceiling = SOURCE_ROW_CEILINGS.get(relationName)!
    if (processedRows > ceiling) {
      throw new Error(
        `${result.name} (${result.scenario_id}) processed ${processedRows} rows from ${relationName}; expected at most ${ceiling} for the normal 200-post seed`,
      )
    }
  }
}

function baseRelationName(node: PlanNode): string {
  return String(node['Relation Name'] ?? '').replace(/__(?:default|p_\w+)$/, '')
}

function collectPlanNodes(value: unknown, nodes: PlanNode[] = []): PlanNode[] {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return nodes
  const node = value as PlanNode
  if (typeof node['Node Type'] === 'string') nodes.push(node)
  const plans = node['Plans']
  if (Array.isArray(plans)) {
    for (const child of plans) collectPlanNodes(child, nodes)
  }
  collectPlanNodes(node['Plan'], nodes)
  return nodes
}
