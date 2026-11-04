import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from '../plan-nodes.mts'

const CLAIMANT_NOTICES_INDEX = 'idx_copyright_notices__claimant_user'

/** The older-window scan must seek below its cursor in the claimant-prefixed index. */
export function assertClaimantMisuseCursorSeek(result: ExplainResult): void {
  const claimantNoticeScans = collectPlanNodes(result.plan).filter(
    node =>
      node['Relation Name'] === 'copyright_notices' &&
      node['Index Name'] === CLAIMANT_NOTICES_INDEX,
  )
  const indexConditions = claimantNoticeScans.flatMap(node =>
    typeof node['Index Cond'] === 'string' ? [node['Index Cond']] : [],
  )
  if (
    !indexConditions.some(condition => /\bid\s*<(?!=)/.test(condition)) ||
    indexConditions.some(condition => /\bROW\s*\(/i.test(condition))
  ) {
    throw new Error(
      `${result.name} must seek id < cursor in ${CLAIMANT_NOTICES_INDEX} without a ROW() comparison`,
    )
  }
}
