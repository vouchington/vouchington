import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes, processedRows } from '../plan-nodes.mts'

/** Topic, review and alias membership each consume the viewer set at most once. */
export function assertPostTopicMembershipIsReused(result: ExplainResult): void {
  const nodes = collectPlanNodes(result.plan)
  const viewerTopicRows = nodes
    .filter(node => node['Subplan Name'] === 'CTE followed_topics')
    .reduce((sum, node) => sum + processedRows(node), 0)
  const membershipRows = nodes
    .filter(node => node['Node Type'] === 'CTE Scan' && node['CTE Name'] === 'followed_topics')
    .reduce((sum, node) => sum + processedRows(node), 0)
  if (membershipRows > viewerTopicRows * 3)
    throw new Error(
      `${result.name} read ${membershipRows} followed-topic rows for ${viewerTopicRows} viewer topics; category, review and alias membership must each reuse one hashed set`,
    )
}
