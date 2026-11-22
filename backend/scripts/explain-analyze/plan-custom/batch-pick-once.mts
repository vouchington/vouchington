import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from '../plan-nodes.mts'

/**
 * A batch delete's `LIMIT n ... FOR UPDATE SKIP LOCKED` pick must run once. A Limit node that
 * executes more than once means the planner rescans the pick under a join, and each rescan skips
 * the rows this statement already deleted and returns the next ones, so the batch bound is lost.
 */
export function assertBatchPickEvaluatedOnce(result: ExplainResult): void {
  const limits = collectPlanNodes(result.plan).filter(node => node['Node Type'] === 'Limit')
  if (limits.length === 0) throw new Error(`${result.name} must plan its batch pick as a Limit`)
  const rescanned = limits.filter(node => Number(node['Actual Loops'] ?? 1) > 1)
  if (rescanned.length > 0)
    throw new Error(`${result.name} evaluated its limited batch pick more than once`)
}
