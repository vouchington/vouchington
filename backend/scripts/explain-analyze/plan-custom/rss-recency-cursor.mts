import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from '../plan-nodes.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

export function assertRssRecencyLateCursorPlan(result: ExplainResult): void {
  if (result.scenario_id !== 'rss-feed-items-search-global-late-cursor') return
  const nodes = collectPlanNodes(result.plan)
  const scans = nodes.filter(node =>
    stringFromUnknown(node['Relation Name'] ?? '').startsWith('rss_feed_items'),
  )
  const hasCursorBound = scans.some(node => {
    const index = stringFromUnknown(node['Index Name'] ?? '')
    const condition = stringFromUnknown(node['Index Cond'] ?? '')
    return (
      (index === 'idx_rss_feed_items__published_at__id' ||
        index.endsWith('_published_at_id_idx')) &&
      /ROW\(published_at, id\) < ROW\(/u.test(condition)
    )
  })

  if (!hasCursorBound || scans.some(node => node['Node Type'] === 'Seq Scan')) {
    throw new Error(
      `${result.name} must use the precise (published_at, id) cursor as an index bound`,
    )
  }
}
