import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from '../plan-nodes.mts'

/** The seeded 435-level chain must stop at the default seven comment levels. */
export function assertCommentDescendantDepthBound(result: ExplainResult): void {
  const worktable = collectPlanNodes(result.plan).find(
    node => node['Node Type'] === 'WorkTable Scan' && node['CTE Name'] === 'descendants',
  )
  const loops = Number(worktable?.['Actual Loops'] ?? 0)
  if (loops < 1 || loops > 8)
    throw new Error(
      `${result.name} walked ${loops} descendant levels; expected the depth-bound walk to stop near seven`,
    )
}
