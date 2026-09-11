import { arbiterMembershipVerdict } from './on-conflict-arbiter.mts'
import { isSafeVolatileFallback, volatileForm } from './on-conflict-excluded-provenance.mts'
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
// Test-time judge for TypeScript-generated config-driven SQL
// (`generated-ddl-insert-invariants.mts`). Tracked `.sql` files use no-mistakes
// `postgres-idempotent-insert`.

/**
 * Whether an `ON CONFLICT DO UPDATE`'s SET targets are safe to re-apply on every worker boot.
 *
 * Convergent iff every self-referencing `ColumnRef` in `targetList[].ResTarget.val` either (a) is a
 * bare reference to the *same* column being assigned — `id = t.id` is a no-op on replay — or (b) is
 * a *direct* argument of `COALESCE`/`GREATEST`/`LEAST` referring to that column, idempotent only for
 * the column they read. A self-reference to a *different* column, or any other self-reference
 * (arithmetic, concatenation, a nested call, or one inside a combinator argument), fails closed.
 *
 * A `ColumnRef` is a self-reference unless its first field is `excluded`: bare `col` and qualified
 * `tbl.col` both resolve to the target row, only `EXCLUDED.col` reads the proposed row. `SubLink`,
 * `MultiAssignRef`, and `ParamRef` (a `$1` bind parameter) are rejected unconditionally at any depth.
 *
 * Checked first: whether the assignment changes a value the conflict arbiter depends on — see
 * `arbiterMembershipVerdict` in `./on-conflict-arbiter.mts` — so that gets its own diagnostic. A
 * subscripted/field-path target (`data['snapshot'] = t.data`) is never a same-column no-op; its
 * indirection expression is walked for self-references too.
 *
 * A volatile value — directly (`on-conflict-volatility.mts`) or via `EXCLUDED.<col>` traced back to a
 * volatile INSERT source (`on-conflict-excluded-provenance.mts`) — is rejected except as a `COALESCE`
 * fallback *after* a self-reference to the target column: `COALESCE(t.col, CURRENT_TIMESTAMP)` writes
 * once, but `COALESCE(CURRENT_TIMESTAMP, t.col)` and `GREATEST(t.col, now())` stay rejected —
 * `MinMaxExpr` allows no such exception since it is monotonic, not idempotent. Parser-agnostic, so
 * the region below stays byte-identical between the frontend and backend copies.
 */
export type ConvergenceVerdict =
  | { convergent: true }
  | { convergent: false; column: string; form: string; remedy?: string }

function isExcludedColumnRef(fields: unknown[]): boolean {
  const first = fields.length === 2 ? fields[0] : undefined
  return isRecord(first) && isRecord(first.String) && first.String.sval === 'excluded'
}

function isColumnRef(node: unknown): node is { ColumnRef: { fields: unknown[] } } {
  return isRecord(node) && isRecord(node.ColumnRef) && Array.isArray(node.ColumnRef.fields)
}

function isSelfReference(node: unknown): boolean {
  if (!isColumnRef(node)) return false
  return !isExcludedColumnRef(node.ColumnRef.fields)
}

/** The column a self-referencing `ColumnRef` names — the last field (`tbl.col` or bare `col`). */
function selfReferenceColumn(node: unknown): string | undefined {
  if (!isColumnRef(node)) return undefined
  const last = node.ColumnRef.fields.at(-1)
  return isRecord(last) && isRecord(last.String) && typeof last.String.sval === 'string'
    ? last.String.sval
    : undefined
}

function isConvergentNode(
  node: unknown,
  shielded: boolean,
  targetColumn: string | undefined,
  insertStmt: unknown,
): boolean {
  if (Array.isArray(node)) {
    return node.every(item => isConvergentNode(item, shielded, targetColumn, insertStmt))
  }
  if (isSelfReference(node)) {
    return shielded && targetColumn !== undefined && selfReferenceColumn(node) === targetColumn
  }
  if (!isRecord(node)) return true
  if (isRecord(node.SubLink) || isRecord(node.MultiAssignRef) || isRecord(node.ParamRef)) {
    return false
  }
  if (volatileForm(node, insertStmt) !== undefined) return false

  const coalesce = node.CoalesceExpr
  if (isRecord(coalesce) && Array.isArray(coalesce.args)) {
    return isConvergentCoalesceArgs(coalesce.args, targetColumn, insertStmt)
  }
  const minMax = node.MinMaxExpr
  if (isRecord(minMax) && Array.isArray(minMax.args)) {
    return minMax.args.every(arg => isConvergentNode(arg, true, targetColumn, insertStmt))
  }

  return Object.values(node).every(value =>
    isConvergentNode(value, false, targetColumn, insertStmt),
  )
}

/**
 * A `COALESCE` arg is convergent under the ordinary shielded self-reference rule, except a volatile
 * value is allowed only once a self-reference to the target column already appeared earlier — the
 * write-once fallback `COALESCE(t.col, CURRENT_TIMESTAMP)`. A volatile value before that, or none in
 * the list, fails closed.
 */
function isConvergentCoalesceArgs(
  args: readonly unknown[],
  targetColumn: string | undefined,
  insertStmt: unknown,
): boolean {
  let selfRefSeen = false
  for (const arg of args) {
    if (volatileForm(arg, insertStmt) !== undefined) {
      if (!selfRefSeen || !isSafeVolatileFallback(arg, insertStmt)) return false
    } else if (!isConvergentNode(arg, true, targetColumn, insertStmt)) {
      return false
    }
    if (
      targetColumn !== undefined &&
      isSelfReference(arg) &&
      selfReferenceColumn(arg) === targetColumn
    ) {
      selfRefSeen = true
    }
  }
  return true
}

const VOLATILE_REMEDY =
  "a value that changes on every replay may only appear as a COALESCE fallback after the column's own value, and only when it is proven non-null (e.g. COALESCE(t.col, CURRENT_TIMESTAMP), never a value that can evaluate to NULL) so it is written once"

function describeForm(val: unknown, insertStmt: unknown): { form: string; remedy?: string } {
  const bareVolatileForm = volatileForm(val, insertStmt)
  if (bareVolatileForm !== undefined) {
    return { form: `a volatile value (${bareVolatileForm})`, remedy: VOLATILE_REMEDY }
  }
  if (isRecord(val)) {
    if (isRecord(val.SubLink)) return { form: 'a subquery' }
    if (isRecord(val.MultiAssignRef)) return { form: 'a multi-column row assignment' }
    if (isRecord(val.ParamRef)) return { form: 'an unresolved bind parameter' }
    if (isRecord(val.A_Expr)) return { form: 'an operator expression' }
    if (isRecord(val.FuncCall)) return { form: 'a function call' }
    const combinator = isRecord(val.CoalesceExpr) ? val.CoalesceExpr : val.MinMaxExpr
    if (isRecord(combinator)) {
      const args = Array.isArray(combinator.args) ? combinator.args : []
      const volatileArgForm = args
        .map(arg => volatileForm(arg, insertStmt))
        .find(form => form !== undefined)
      if (volatileArgForm !== undefined) {
        return { form: `a volatile value (${volatileArgForm})`, remedy: VOLATILE_REMEDY }
      }
      return { form: 'a COALESCE/GREATEST/LEAST expression referencing a different column' }
    }
  }
  return { form: 'a non-convergent expression' }
}

function nonConvergent(column: string, form: string, remedy?: string): ConvergenceVerdict {
  return { convergent: false, column, form, remedy }
}

/** `onConflictClause` as produced by @libpg-query/parser. Walks `targetList`; ignores the DO UPDATE's own `WHERE` clause — it only restricts which rows update, never convergence. */
export function isConvergentOnConflict(
  onConflictClause: unknown,
  insertStmt?: unknown,
): ConvergenceVerdict {
  if (!isRecord(onConflictClause)) return { convergent: true }
  const targetList = onConflictClause.targetList
  if (!Array.isArray(targetList)) return { convergent: true }

  for (const target of targetList) {
    if (!isRecord(target) || !isRecord(target.ResTarget)) continue
    const resTarget = target.ResTarget
    const columnName = typeof resTarget.name === 'string' ? resTarget.name : undefined
    const hasIndirection = Array.isArray(resTarget.indirection) && resTarget.indirection.length > 0
    const column = columnName ?? '?'

    const arbiterVerdict = arbiterMembershipVerdict(
      onConflictClause.infer,
      columnName,
      hasIndirection,
      resTarget.val,
    )
    if (arbiterVerdict.kind === 'violation') {
      return nonConvergent(column, arbiterVerdict.form, arbiterVerdict.remedy)
    }
    if (arbiterVerdict.kind === 'safe') continue
    if (hasIndirection && !isConvergentNode(resTarget.indirection, false, undefined, insertStmt)) {
      return nonConvergent(column, 'a subscript/field-path index containing a self-reference')
    }

    const targetColumn = hasIndirection ? undefined : columnName
    const isBareIdentity =
      targetColumn !== undefined &&
      isSelfReference(resTarget.val) &&
      selfReferenceColumn(resTarget.val) === targetColumn
    if (isBareIdentity || isConvergentNode(resTarget.val, false, targetColumn, insertStmt)) continue
    const { form, remedy } = describeForm(resTarget.val, insertStmt)
    return nonConvergent(column, form, remedy)
  }

  return { convergent: true }
}

export { isGuardedSelect } from './on-conflict-guarded-select.mts'
