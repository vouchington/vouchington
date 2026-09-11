function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
// Test-time judge for TypeScript-generated config-driven SQL
// (`generated-ddl-insert-invariants.mts`). Tracked `.sql` files use no-mistakes
// `postgres-idempotent-insert`.

/**
 * AST helpers for recognizing self-references, `EXCLUDED.<col>` references, and NULL-proof
 * predicates in a parsed `ON CONFLICT` clause. Split out of on-conflict-arbiter.mts, which
 * imports these instead of defining them locally, so on-conflict-generated-arbiter.mts's own
 * generated-column dependency harvest (#11068) can reuse `collectColumnRefs` without a third
 * copy.
 */

function isColumnRef(node: unknown): node is { ColumnRef: { fields: unknown[] } } {
  return isRecord(node) && isRecord(node.ColumnRef) && Array.isArray(node.ColumnRef.fields)
}

function isExcludedColumnRef(fields: unknown[]): boolean {
  const first = fields.length === 2 ? fields[0] : undefined
  return isRecord(first) && isRecord(first.String) && first.String.sval === 'excluded'
}

function columnRefName(node: unknown): string | undefined {
  if (!isColumnRef(node)) return undefined
  const last = node.ColumnRef.fields.at(-1)
  return isRecord(last) && isRecord(last.String) && typeof last.String.sval === 'string'
    ? last.String.sval
    : undefined
}

/** Whether `val` is a bare (non-`EXCLUDED`) reference to `column`. */
export function isBareSelfReference(val: unknown, column: string): boolean {
  return (
    isColumnRef(val) && !isExcludedColumnRef(val.ColumnRef.fields) && columnRefName(val) === column
  )
}

/** Whether `val` is `EXCLUDED.<column>`. */
export function isExcludedReferenceToColumn(val: unknown, column: string): boolean {
  return (
    isColumnRef(val) && isExcludedColumnRef(val.ColumnRef.fields) && columnRefName(val) === column
  )
}

/** The column name of an `EXCLUDED.<col>` reference, or undefined for any other node. */
export function excludedColumnRefName(node: unknown): string | undefined {
  if (!isColumnRef(node) || !isExcludedColumnRef(node.ColumnRef.fields)) return undefined
  return columnRefName(node)
}

/** Collects every non-`EXCLUDED` column name referenced anywhere under `node`. */
export function collectColumnRefs(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectColumnRefs(item, out)
    return
  }
  if (isColumnRef(node)) {
    if (!isExcludedColumnRef(node.ColumnRef.fields)) {
      const column = columnRefName(node)
      if (column !== undefined) out.add(column)
    }
    return
  }
  if (!isRecord(node)) return
  for (const value of Object.values(node)) collectColumnRefs(value, out)
}

// Only descends through a conjunctive (AND-only) chain — an OR branch does not hold for every
// row the arbiter could have matched, so a column proven NULL under one OR arm is not provably
// NULL in general.
export function collectNullProvenColumns(node: unknown, out: Set<string>): void {
  if (!isRecord(node)) return
  const boolExpr = node.BoolExpr
  if (isRecord(boolExpr) && boolExpr.boolop === 'AND_EXPR' && Array.isArray(boolExpr.args)) {
    for (const arg of boolExpr.args) collectNullProvenColumns(arg, out)
    return
  }
  const nullTest = node.NullTest
  if (isRecord(nullTest) && nullTest.nulltesttype === 'IS_NULL') {
    const column = columnRefName(nullTest.arg)
    if (column !== undefined) out.add(column)
  }
}

export function isNullLiteral(val: unknown): boolean {
  return isRecord(val) && isRecord(val.A_Const) && val.A_Const.isnull === true
}

/** Whether `node` is `t.<column> IS DISTINCT FROM EXCLUDED.<column>` (or the symmetric form). */
export function isDistinctFromExcluded(node: unknown, column: string): boolean {
  if (!isRecord(node) || !isRecord(node.A_Expr) || node.A_Expr.kind !== 'AEXPR_DISTINCT') {
    return false
  }
  const { lexpr, rexpr } = node.A_Expr
  return (
    (isBareSelfReference(lexpr, column) && isExcludedReferenceToColumn(rexpr, column)) ||
    (isBareSelfReference(rexpr, column) && isExcludedReferenceToColumn(lexpr, column))
  )
}

// Mirrors collectNullProvenColumns' AND-only descent, proving EXCLUDED.<col> IS NOT NULL instead.
export function collectExcludedNotNullColumns(node: unknown, out: Set<string>): void {
  if (!isRecord(node)) return
  const boolExpr = node.BoolExpr
  if (isRecord(boolExpr) && boolExpr.boolop === 'AND_EXPR' && Array.isArray(boolExpr.args)) {
    for (const arg of boolExpr.args) collectExcludedNotNullColumns(arg, out)
    return
  }
  const nullTest = node.NullTest
  if (isRecord(nullTest) && nullTest.nulltesttype === 'IS_NOT_NULL') {
    const excludedColumn = excludedColumnRefName(nullTest.arg)
    if (excludedColumn !== undefined) out.add(excludedColumn)
  }
}

/** Whether the WHERE clause proves `t.<column> IS NULL AND EXCLUDED.<column> IS NOT NULL`. */
export function isNullUntilProvenNonNull(node: unknown, column: string): boolean {
  const nullProven = new Set<string>()
  collectNullProvenColumns(node, nullProven)
  if (!nullProven.has(column)) return false
  const excludedNotNull = new Set<string>()
  collectExcludedNotNullColumns(node, excludedNotNull)
  return excludedNotNull.has(column)
}
