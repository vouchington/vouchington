import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from './plan-nodes.mts'
import { RSS_RECENCY_LATE_CURSOR_PAGE_SIZE } from './seed-data/common.mts'

export function assertRssRecencyLateCursorPlan(result: ExplainResult): void {
  const nodes = collectPlanNodes(result.plan)
  const scans = nodes.filter(node =>
    String(node['Relation Name'] ?? '').startsWith('rss_feed_items'),
  )
  const hasCursorBound = scans.some(node => {
    const index = String(node['Index Name'] ?? '')
    const condition = String(node['Index Cond'] ?? '')
    return (
      (index === 'idx_rss_feed_items__published_at__id' ||
        index.endsWith('_published_at_id_idx')) &&
      /ROW\(published_at, id\) < ROW\(/u.test(condition)
    )
  })
  const sourceWork = scans.reduce(
    (work, node) =>
      work +
      (Number(node['Actual Rows'] ?? 0) +
        Number(node['Rows Removed by Filter'] ?? 0) +
        Number(node['Rows Removed by Index Recheck'] ?? 0)) *
        Number(node['Actual Loops'] ?? 1),
    0,
  )
  if (
    !hasCursorBound ||
    scans.some(node => node['Node Type'] === 'Seq Scan') ||
    sourceWork > RSS_RECENCY_LATE_CURSOR_PAGE_SIZE + 1
  ) {
    throw new Error(
      `${result.name} must use the precise (published_at, id) cursor as an index bound with at most ${RSS_RECENCY_LATE_CURSOR_PAGE_SIZE + 1} RSS candidate rows; observed ${sourceWork}`,
    )
  }
}
