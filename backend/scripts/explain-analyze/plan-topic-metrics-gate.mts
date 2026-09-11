import type { ExplainResult } from '@data-stores/psql'

const TOPIC_METRICS_SCENARIO = 'topic-metrics-batch'
const DEFAULT_SOURCE_ROW_CEILING = 5_000
const SOURCE_ROW_CEILINGS = new Map<string, number>([
  ['posts', DEFAULT_SOURCE_ROW_CEILING],
  ['relation__post__category__topic', DEFAULT_SOURCE_ROW_CEILING],
  ['relation__post__category__topic_alias', DEFAULT_SOURCE_ROW_CEILING],
  ['post_review_topic_ratings', DEFAULT_SOURCE_ROW_CEILING],
  ['post_data_point_topics', DEFAULT_SOURCE_ROW_CEILING],
  ['rss_feed_item_categories', 6_000],
  ['rss_feed_item_sources', 20_000],
  ['rss_feed_items', 10_000],
  ['rss_feeds', 6_000],
])

type PlanNode = Record<string, unknown>

export function assertTopicMetricsBatchIsCandidateBounded(result: ExplainResult): void {
  if (result.scenario_id !== TOPIC_METRICS_SCENARIO) return

  if (!/\brequested_topic_ids\b/.test(result.query_text)) {
    throw new Error(
      `${result.name} (${result.scenario_id}) must constrain metric sources through requested_topic_ids`,
    )
  }

  const nodes = collectPlanNodes(result.plan)
  const correlatedSubplan = nodes.find(
    node =>
      String(node['Subplan Name'] ?? '').startsWith('SubPlan') &&
      String(node['Node Type'] ?? '').includes('Aggregate'),
  )
  if (correlatedSubplan) {
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
    const ceiling = SOURCE_ROW_CEILINGS.get(relationName) ?? DEFAULT_SOURCE_ROW_CEILING
    if (processedRows > ceiling) {
      throw new Error(
        `${result.name} (${result.scenario_id}) processed ${processedRows} rows from ${relationName}; expected at most ${ceiling} for the normal 100-topic seed`,
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
