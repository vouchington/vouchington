import type { ExplainResult } from '@data-stores/psql'

const USER_REMOVED_POSTS_INDEX = 'idx_posts__default__created_by_rejected_at_id'

export function assertUserRemovedPostsUsesIndex(result: ExplainResult): void {
  const nodes = collectPlanNodes(result.plan)
  const usesOwnerRemovalIndex = nodes.some(node => node['Index Name'] === USER_REMOVED_POSTS_INDEX)
  const scansPosts = nodes.some(
    node =>
      node['Node Type'] === 'Seq Scan' && String(node['Relation Name'] ?? '').startsWith('posts__'),
  )
  if (!usesOwnerRemovalIndex || scansPosts) {
    throw new Error(
      `${result.name} must page platform removals through ${USER_REMOVED_POSTS_INDEX} without a posts sequential scan`,
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
