import { collectPlanNodes, type PlanNode } from './plan-nodes.mts'

export function isBoundedStoryPresentationSort(node: PlanNode, nodes: PlanNode[]): boolean {
  const children =
    (node.Plans as PlanNode[] | undefined)?.filter(
      child => child['Parent Relationship'] !== 'InitPlan',
    ) ?? []
  const input = children.flatMap(child => collectPlanNodes(child))
  const nativePage = nodes.find(candidate => candidate['Subplan Name'] === 'CTE items')
  if (!nativePage || !input.some(candidate => candidate['CTE Name'] === 'items')) return false
  if (
    input.some(candidate => String(candidate['Relation Name'] ?? '').startsWith('rss_feed_items'))
  )
    return false
  const physicalSourceRows = collectPlanNodes(nativePage)
    .filter(candidate => String(candidate['Relation Name'] ?? '').startsWith('rss_feed_items'))
    .reduce(
      (total, candidate) =>
        total +
        (Number(candidate['Actual Rows'] ?? Infinity) +
          Number(candidate['Rows Removed by Filter'] ?? 0) +
          Number(candidate['Rows Removed by Index Recheck'] ?? 0)) *
          Number(candidate['Actual Loops'] ?? 1),
      0,
    )
  return (
    physicalSourceRows > 0 &&
    physicalSourceRows <= 100 &&
    Number(nativePage['Actual Rows'] ?? Infinity) <= 100 &&
    Number(node['Actual Rows'] ?? Infinity) <= 100 &&
    children.length > 0 &&
    children.every(
      child => Number(child['Actual Rows'] ?? Infinity) * Number(child['Actual Loops'] ?? 1) <= 100,
    )
  )
}
