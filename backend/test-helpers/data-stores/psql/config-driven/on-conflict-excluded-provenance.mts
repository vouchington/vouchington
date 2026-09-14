import { excludedColumnRefName } from './on-conflict-column-refs.mts'
import { volatileValueForm } from './on-conflict-volatility.mts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
// Test-time judge for TypeScript-generated config-driven SQL
// (`generated-ddl-insert-invariants.mts`). Tracked `.sql` files use no-mistakes
// `postgres-idempotent-insert`.

/**
 * Whether an `EXCLUDED.<col>` reference is volatile through the INSERT it came from, not through
 * its own (inert) `ColumnRef` shape. `INSERT INTO t (id, token) VALUES (1, gen_random_uuid()) ON
 * CONFLICT (id) DO UPDATE SET token = EXCLUDED.token` looks convergent to `on-conflict-volatility`
 * — `EXCLUDED.token` is a `ColumnRef`, not a `FuncCall` — but the row being inserted *right now*
 * already carries a fresh `gen_random_uuid()`, so writing it through `EXCLUDED.token` still
 * changes on every replay. This module traces `EXCLUDED.<col>` back to the same statement's
 * `InsertStmt` and judges the source expression(s) instead.
 *
 * A column absent from the INSERT's explicit column list (it takes its schema DEFAULT, which
 * could itself be volatile) is deliberately out of scope — `insertSourceExprsForColumn` returns
 * undefined and the reference is treated as non-volatile, matching this guard's existing
 * corpus-driven scoping decisions.
 */

function insertColumnIndex(
  insertStmt: Record<string, unknown>,
  column: string,
): number | undefined {
  const cols = insertStmt.cols
  if (!Array.isArray(cols)) return undefined
  const index = cols.findIndex(
    col => isRecord(col) && isRecord(col.ResTarget) && col.ResTarget.name === column,
  )
  return index === -1 ? undefined : index
}

/** The indexed projection from one (non-set-operation) `SELECT`/`VALUES`: the matching `VALUES`
 * slot from every row, or the matching `INSERT ... SELECT` target. A `UNION`/`INTERSECT`/`EXCEPT`
 * root has no `targetList`/`valuesLists` of its own — its branches live under `larg`/`rarg`,
 * unwrapped and directly recursable (mirrors `isGuardedSelect`'s identical recursion). */
function sourceExprsFromSelect(
  select: Record<string, unknown>,
  index: number,
): unknown[] | undefined {
  if (select.op !== 'SETOP_NONE' && isRecord(select.larg) && isRecord(select.rarg)) {
    const left = sourceExprsFromSelect(select.larg, index)
    const right = sourceExprsFromSelect(select.rarg, index)
    return left === undefined && right === undefined
      ? undefined
      : [...(left ?? []), ...(right ?? [])]
  }
  if (Array.isArray(select.valuesLists)) {
    return select.valuesLists.flatMap(row => {
      const items = isRecord(row) && isRecord(row.List) ? row.List.items : undefined
      const item = Array.isArray(items) ? items[index] : undefined
      return item === undefined ? [] : [item]
    })
  }
  if (Array.isArray(select.targetList)) {
    const target = select.targetList[index]
    const val = isRecord(target) && isRecord(target.ResTarget) ? target.ResTarget.val : undefined
    return val === undefined ? [] : [val]
  }
  return undefined
}

/**
 * The INSERT's source expression(s) for `column`. Undefined when `column` isn't in the INSERT's
 * column list, or the statement shape isn't recognized.
 */
export function insertSourceExprsForColumn(
  insertStmt: unknown,
  column: string,
): unknown[] | undefined {
  if (!isRecord(insertStmt)) return undefined
  const index = insertColumnIndex(insertStmt, column)
  if (index === undefined) return undefined
  const selectStmt = insertStmt.selectStmt
  const select = isRecord(selectStmt) ? selectStmt.SelectStmt : undefined
  return isRecord(select) ? sourceExprsFromSelect(select, index) : undefined
}

/** Whether a subtree contains a volatile value or an unresolved bind parameter anywhere. An
 * INSERT source expression has no self-reference to shield against (there is no prior row to
 * read), so any match at any depth makes it unsafe to re-surface later through `EXCLUDED.<col>`. */
function containsVolatileValue(node: unknown): boolean {
  if (volatileValueForm(node) !== undefined) return true
  if (isRecord(node) && isRecord(node.ParamRef)) return true
  if (Array.isArray(node)) return node.some(containsVolatileValue)
  return isRecord(node) && Object.values(node).some(containsVolatileValue)
}

/** `EXCLUDED.<col>`'s display form when `<col>`'s own INSERT source is volatile, else undefined. */
export function excludedProvenanceForm(node: unknown, insertStmt: unknown): string | undefined {
  const column = excludedColumnRefName(node)
  if (column === undefined) return undefined
  const sourceExprs = insertSourceExprsForColumn(insertStmt, column)
  return sourceExprs?.some(containsVolatileValue) === true ? `EXCLUDED.${column}` : undefined
}

/**
 * Whether `node`'s already-detected volatility is safe as a write-once `COALESCE` fallback. A
 * bare denylisted call/`SQLValueFunction` is always non-null by Postgres semantics; an
 * `EXCLUDED.<col>` reference is safe only when every volatile source expression traced for
 * `<col>` is itself such a bare call — never buried inside a conditional (e.g. `CASE WHEN
 * random() < 0.5 THEN NULL ELSE gen_random_uuid() END`) that can yield NULL on the replay that
 * "wins", leaving the column unset instead of settling in one pass.
 */
export function isSafeVolatileFallback(node: unknown, insertStmt: unknown): boolean {
  if (volatileValueForm(node) !== undefined) return true
  const column = excludedColumnRefName(node)
  if (column === undefined) return false
  const sourceExprs = insertSourceExprsForColumn(insertStmt, column)
  return (
    sourceExprs !== undefined &&
    sourceExprs.every(expr => !containsVolatileValue(expr) || volatileValueForm(expr) !== undefined)
  )
}

/** Volatile either directly, or via an `EXCLUDED.<col>` reference back to a volatile INSERT
 * source in the same statement. */
export function volatileForm(node: unknown, insertStmt: unknown): string | undefined {
  return volatileValueForm(node) ?? excludedProvenanceForm(node, insertStmt)
}
