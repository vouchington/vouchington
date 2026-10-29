import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import type { ExplainResult } from '@data-stores/psql'
import { baseRelationName, collectPlanNodes } from '../plan-nodes.mts'

const POST_ID_PREDICATE = /\bWHERE\s+id\s*=\s*\$[1-9]\d*/iu
const POST_ID_INDEX_CONDITION = /\bid\s*=/iu
const POST_PRIMARY_KEY_INDEX = /^posts(?:__\w+)?_pkey$/u

/** Keep the creation-bypass read on one post even when transition history expires. */
export function assertPostCreationBypassPointRead(result: ExplainResult): void {
  const hasSqlBound = POST_ID_PREDICATE.test(result.query_text)
  const hasPlanBound = collectPlanNodes(result.plan).some(node => {
    if (baseRelationName(node) !== 'posts') return false
    return (
      POST_PRIMARY_KEY_INDEX.test(stringFromUnknown(node['Index Name'] ?? '')) &&
      POST_ID_INDEX_CONDITION.test(stringFromUnknown(node['Index Cond'] ?? ''))
    )
  })
  if (!hasSqlBound || !hasPlanBound) {
    throw new Error(`${result.name} must point-read posts by id`)
  }
}
