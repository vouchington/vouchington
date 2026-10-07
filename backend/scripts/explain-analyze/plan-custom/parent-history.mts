import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import type { ExplainResult } from '@data-stores/psql'
import { baseRelationName, collectPlanNodes } from '../plan-nodes.mts'

const HISTORY_TABLE = 'post_clearance_changes'
const ID_LOWER_BOUND = /\bid\s*>=/i
const SQL_ID_LOWER_BOUND = /\bid\s*>=\s*\$[1-9]\d*/i

/** Require the parent-derived history bound to reach both SQL and the executed history scan. */
export function assertParentHistoryLowerBound(result: ExplainResult): void {
  const hasSqlBound = SQL_ID_LOWER_BOUND.test(result.query_text)
  const hasPlanBound = collectPlanNodes(result.plan).some(node => {
    if (baseRelationName(node) !== HISTORY_TABLE) return false
    return ['Index Cond', 'Recheck Cond', 'Filter'].some(key =>
      ID_LOWER_BOUND.test(stringFromUnknown(node[key] ?? '')),
    )
  })
  if (!hasSqlBound || !hasPlanBound) {
    throw new Error(`${result.name} must constrain ${HISTORY_TABLE}.id with a lower bound`)
  }
}
