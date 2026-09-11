import type { ExplainResult } from '@data-stores/psql'

const SUPPORT_MESSAGES_INDEX = 'uq_support_messages__thread_id'
const SUPPORT_MESSAGE_SCENARIOS = new Set([
  'support-messages-page',
  'support-messages-page-after',
  'support-messages-page-at-or-before',
  'support-draft-generation-reservation',
  'support-agent-run-finalize',
])

export function assertSupportMessagesUseIndexOrder(result: ExplainResult): void {
  if (!SUPPORT_MESSAGE_SCENARIOS.has(result.scenario_id ?? '')) return

  const nodes = collectPlanNodes(result.plan)
  const usesSupportMessagesIndex = nodes.some(node => node['Index Name'] === SUPPORT_MESSAGES_INDEX)
  const invalidSupportMessagesAccess =
    result.scenario_id !== 'support-draft-generation-reservation' &&
    nodes.some(
      node =>
        node['Relation Name'] === 'support_messages' &&
        node['Index Name'] !== SUPPORT_MESSAGES_INDEX,
    )
  const explicitSort = nodes.some(node => String(node['Node Type'] ?? '').includes('Sort'))
  if (!usesSupportMessagesIndex || invalidSupportMessagesAccess || explicitSort) {
    throw new Error(
      `${result.name} must use ${SUPPORT_MESSAGES_INDEX} for support-message UUIDv7 order without an explicit Sort`,
    )
  }
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
