import type { ExplainResult } from '@data-stores/psql'
import { getPostsWorkLimit } from '@services/posts/work-limits'
import { collectPlanNodes, type PlanNode } from '../plan-nodes.mts'

const STORY_SOURCE_INDEX = 'idx_rss_feed_item_sources__story_feed_item'

/** Each owner-probe index walk stays inside the configured source cap. */
export function assertStoryOwnerProbeCap(result: ExplainResult): void {
  const cap = getPostsWorkLimit('story_source_owner_probe_limit')
  const scans = collectPlanNodes(result.plan).filter(
    node => node['Index Name'] === STORY_SOURCE_INDEX && Number(node['Actual Loops'] ?? 0) > 0,
  )
  if (scans.length === 0) {
    throw new Error(`${result.name} owner probe did not read ${STORY_SOURCE_INDEX}`)
  }
  for (const scan of scans) {
    const perLoop = rowsPerLoop(scan)
    if (perLoop > cap) {
      throw new Error(
        `${result.name} owner probe read ${perLoop} rss_feed_item_sources rows in one loop; cap is ${cap}`,
      )
    }
  }
}

function rowsPerLoop(node: PlanNode): number {
  return (
    Number(node['Actual Rows'] ?? 0) +
    Number(node['Rows Removed by Filter'] ?? 0) +
    Number(node['Rows Removed by Index Recheck'] ?? 0)
  )
}
