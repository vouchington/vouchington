import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes, processedRows, type PlanNode } from '../plan-nodes.mts'

/** One claim walks a single index ordered row. A sort may only see that one candidate. */
export function assertStoryProjectionClaimCandidates(result: ExplainResult): void {
  const sorts = collectPlanNodes(result.plan).filter(node =>
    ['Sort', 'Incremental Sort'].includes(String(node['Node Type'])),
  )
  for (const sort of sorts) {
    const children = sort.Plans
    if (!Array.isArray(children) || children.length !== 1)
      throw new Error(`${result.name} must expose one measured input per claim candidate sort`)
    const child = children[0] as PlanNode | null
    if (
      child === null ||
      typeof child !== 'object' ||
      Array.isArray(child) ||
      typeof child['Actual Rows'] !== 'number' ||
      !Number.isFinite(child['Actual Rows']) ||
      typeof child['Actual Loops'] !== 'number' ||
      !Number.isFinite(child['Actual Loops']) ||
      child['Actual Rows'] < 0 ||
      child['Actual Loops'] < 0 ||
      !Number.isFinite(processedRows(child)) ||
      processedRows(child) > 1
    )
      throw new Error(`${result.name} must sort at most one claim candidate from its input`)
  }
}
