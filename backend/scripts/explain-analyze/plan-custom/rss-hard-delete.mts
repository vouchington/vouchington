import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from '../plan-nodes.mts'

/** A resumed recovery must seek its cursor inside the partial index, never filter a prefix. */
export function assertRssHardDeleteRecoverySeek(result: ExplainResult): void {
  const seek = collectPlanNodes(result.plan).find(node => {
    const condition = node['Index Cond']
    return (
      node['Index Name'] === 'idx_rss_feeds__hard_delete_pending_id' &&
      typeof condition === 'string' &&
      /\bid\s*>(?!=)/.test(condition) &&
      (result.plan_cache_mode !== 'force_generic_plan' || condition.includes('$1'))
    )
  })
  if (!seek) throw new Error(`${result.name} must seek the recovery cursor in the pending-ID index`)
}
