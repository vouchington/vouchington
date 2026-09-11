import type { ExplainResult } from '@data-stores/psql'

const RETENTION_INDEX = 'idx_user_topic_import_attempts__retention'
const USER_KEY_INDEX = 'user_topic_import_attempts_user_key_unique'

export function assertTopicImportAttemptPlanShapeIfApplicable(result: ExplainResult): void {
  if (
    result.scenario_id !== 'topic-import-attempts-retention' &&
    result.scenario_id !== 'topic-import-attempts-user-key'
  ) {
    return
  }
  assertTopicImportAttemptPlanShape(result)
}

export function assertTopicImportAttemptPlanShape(result: ExplainResult): void {
  const nodes = collectPlanNodes(result.plan)
  const requiredIndex = requiredIndexForScenario(result.scenario_id)
  const usesRequiredIndex = nodes.some(node => node['Index Name'] === requiredIndex)
  const scansAttempts = nodes.some(
    node =>
      node['Node Type'] === 'Seq Scan' && node['Relation Name'] === 'user_topic_import_attempts',
  )
  if (!usesRequiredIndex || scansAttempts) {
    throw new Error(
      `${result.name} must use ${requiredIndex} without a user_topic_import_attempts sequential scan`,
    )
  }
}

function requiredIndexForScenario(scenarioId: string | undefined): string {
  if (scenarioId === 'topic-import-attempts-retention') return RETENTION_INDEX
  if (scenarioId === 'topic-import-attempts-user-key') return USER_KEY_INDEX
  throw new Error(`Unknown topic import attempt plan scenario: ${scenarioId ?? 'missing'}`)
}

type PlanNode = Record<string, unknown>

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
