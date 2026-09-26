export type PlanNode = Record<string, unknown>

export function collectPlanNodes(value: unknown, nodes: PlanNode[] = []): PlanNode[] {
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
