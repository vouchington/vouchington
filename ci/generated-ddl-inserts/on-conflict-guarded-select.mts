import type { PostgresSqlQuery, PostgresSqlSpan } from 'no-mistakes'

function contains(outer: PostgresSqlSpan | null, inner: PostgresSqlSpan | null): boolean {
  return (
    outer !== null &&
    inner !== null &&
    outer.start.offset <= inner.start.offset &&
    outer.end.offset >= inner.end.offset
  )
}

/** Every SELECT branch must conjunctively require NOT EXISTS in its own WHERE clause. */
export function isGuardedSelect(query: PostgresSqlQuery): boolean {
  if (!query.complete || query.unsupported.length > 0) return false
  const root = query.scopes.find(scope => scope.clause === 'root' && scope.parentScopeId === null)
  if (root === undefined) return false
  const leaves = [root]
  for (let index = 0; index < leaves.length; index++) {
    const branch = leaves[index]
    const children = query.scopes.filter(
      scope => scope.clause === 'setBranch' && scope.parentScopeId === branch?.id,
    )
    if (children.length === 0) continue
    leaves.splice(index, 1, ...children)
    index--
  }
  return (
    leaves.length > 0 &&
    leaves.every(leaf => {
      const where = query.scopes.filter(
        scope => scope.parentScopeId === leaf.id && scope.clause === 'where',
      )
      return query.exists.some(
        exists =>
          exists.scopeId === leaf.id &&
          exists.effectiveNegated === true &&
          exists.context.effectiveMandatory === true &&
          !exists.context.underCase &&
          !exists.context.underBooleanTest &&
          !exists.context.underOther &&
          where.some(scope => contains(scope.span, exists.span)),
      )
    })
  )
}
