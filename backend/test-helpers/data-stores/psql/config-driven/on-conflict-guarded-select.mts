function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
// Test-time judge for TypeScript-generated config-driven SQL
// (`generated-ddl-insert-invariants.mts`). Tracked `.sql` files use no-mistakes
// `postgres-idempotent-insert`.

/**
 * The `NOT EXISTS` guard path for a config-driven `INSERT` that has no `ON CONFLICT` clause at
 * all — split out of on-conflict-convergence.mts, which re-exports both names below for its
 * existing importers. This is a different guard than convergence: it proves an INSERT cannot
 * re-fire on replay by construction (`WHERE NOT EXISTS (...)`), not by proving a `DO UPDATE` is
 * idempotent.
 */

function isNotExistsExpr(node: unknown): boolean {
  if (!isRecord(node)) return false
  const boolExpr = node.BoolExpr
  if (!isRecord(boolExpr) || boolExpr.boolop !== 'NOT_EXPR') return false
  const args = boolExpr.args
  if (!Array.isArray(args) || args.length !== 1) return false
  const inner = args[0]
  return (
    isRecord(inner) && isRecord(inner.SubLink) && inner.SubLink.subLinkType === 'EXISTS_SUBLINK'
  )
}

/**
 * Whether `whereClause` conjunctively requires a `NOT EXISTS (...)` — i.e. the clause itself is
 * `NOT EXISTS (...)`, or an `AND` chain where at least one branch is. An `OR`-joined `NOT EXISTS`
 * is disjunctive (e.g. `WHERE force_seed OR NOT EXISTS (...)` still inserts whenever
 * `force_seed` is true regardless of whether `NOT EXISTS` holds) and must not be mistaken for a
 * guard.
 */
export function hasConjunctiveNotExists(whereClause: unknown): boolean {
  if (isNotExistsExpr(whereClause)) return true
  if (!isRecord(whereClause)) return false
  const boolExpr = whereClause.BoolExpr
  if (!isRecord(boolExpr) || boolExpr.boolop !== 'AND_EXPR') return false
  const args = boolExpr.args
  return Array.isArray(args) && args.some(hasConjunctiveNotExists)
}

/**
 * Whether `selectStmt` (an `InsertStmt.selectStmt.SelectStmt`, or a set-operation branch
 * under `larg`/`rarg`) is guarded. For a `UNION`/`INTERSECT`/`EXCEPT` query, libpg-query
 * hangs each branch's own predicate off that branch's `larg`/`rarg`, leaving the root
 * `SelectStmt`'s own `whereClause` unset even when every branch carries its own conjunctive
 * `NOT EXISTS` — so a set-operation node recurses into both branches and requires each to be
 * guarded, rather than reading `whereClause` directly off it. Requiring every branch guarded
 * is exact for `UNION`; for `INTERSECT`/`EXCEPT` it is conservative rather than exact (the
 * right-hand branch can only narrow the result, never add rows), which is deliberate — this
 * module fails closed uniformly rather than reasoning about per-operator row semantics.
 */
export function isGuardedSelect(selectStmt: unknown): boolean {
  if (!isRecord(selectStmt)) return false
  if (selectStmt.op !== 'SETOP_NONE' && isRecord(selectStmt.larg) && isRecord(selectStmt.rarg)) {
    return isGuardedSelect(selectStmt.larg) && isGuardedSelect(selectStmt.rarg)
  }
  return hasConjunctiveNotExists(selectStmt.whereClause)
}
