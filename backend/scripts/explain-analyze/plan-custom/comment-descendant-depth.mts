import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from '../plan-nodes.mts'

/** The fixture has one approved branch for the first seven levels of its 435-level chain. */
export function assertCommentDescendantDepthBound(result: ExplainResult): void {
  const descendants = collectPlanNodes(result.plan).find(
    node => node['Node Type'] === 'CTE Scan' && node['CTE Name'] === 'descendants',
  )
  const rows =
    Number(descendants?.['Actual Rows'] ?? 0) * Number(descendants?.['Actual Loops'] ?? 0)
  if (rows !== 7)
    throw new Error(
      `${result.name} walked ${rows} seeded descendants; expected seven from the bounded chain`,
    )
}
