import {
  collectColumnRefs,
  collectNullProvenColumns,
  isBareSelfReference,
  isExcludedReferenceToColumn,
  isNullLiteral,
} from './on-conflict-column-refs.mts'
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
// Test-time judge for TypeScript-generated config-driven SQL
// (`generated-ddl-insert-invariants.mts`). Tracked `.sql` files use no-mistakes
// `postgres-idempotent-insert`. Does not import from
// on-conflict-convergence.mts, to avoid a circular import between the two files.

/**
 * Whether an `ON CONFLICT DO UPDATE` assignment preserves the row's membership in the conflict
 * arbiter it matched under — a stable, non-accumulating assignment (see on-conflict-convergence.mts)
 * can still be non-convergent if it changes a value the arbiter depends on, since the next replay
 * may then fail to match the same row.
 *
 * A column is "arbiter-protected" when it is a KEY column (from `infer.indexElems`, resolved by
 * `resolveIndexElemColumn`) or referenced in the arbiter's own partial-index predicate
 * (`infer.whereClause` — distinct from `onConflictClause.whereClause`, not read here).
 *
 * A protected assignment is safe iff: (a) a bare self-reference to the same column — always a
 * no-op for both key and predicate columns; (b) `EXCLUDED.<same column>` on a KEY column —
 * Postgres guarantees equality there (see `resolveIndexElemColumn` for expression keys), but a
 * partial-index predicate places no such constraint on `EXCLUDED`, so this does not extend to
 * predicate-only columns; or (c) a NULL literal on a column a conjunctive (AND-only) `IS NULL` in
 * the predicate already proves NULL for every matchable row — not extended to `IS NOT NULL`,
 * which no known usage needs. Everything else protected fails closed.
 *
 * When the arbiter itself is unresolvable, every assigned column is treated as protected and fails
 * closed unless it is a bare self-reference — except under a named constraint (`infer.conname`),
 * where `EXCLUDED.<col>` is also safe: Postgres bars `DO UPDATE` on exclusion constraints and bars
 * named unique/PK constraints from being partial, so any constraint valid here is a full-table key
 * and EXCLUDED must equal the existing row on every column it depends on. A zero/multi-column
 * expression-index element has no such guarantee and stays fully closed.
 */
export type ArbiterVerdict =
  | { kind: 'safe' }
  | { kind: 'not-protected' }
  | { kind: 'violation'; form: string; remedy: string }

/** The column an index element resolves to: its static `.name` for a plain-column element, or —
 * for an expression element — the sole column it references, when it references exactly one.
 * `undefined` when the element references zero or multiple columns. */
function resolveIndexElemColumn(elem: unknown): string | undefined {
  if (!isRecord(elem) || !isRecord(elem.IndexElem)) return undefined
  const indexElem = elem.IndexElem
  if (typeof indexElem.name === 'string') return indexElem.name
  const exprColumns = new Set<string>()
  collectColumnRefs(indexElem.expr, exprColumns)
  return exprColumns.size === 1 ? [...exprColumns][0] : undefined
}

/** `undefined` means the arbiter's key columns cannot be statically resolved. */
export function resolveKeyColumns(infer: Record<string, unknown>): Set<string> | undefined {
  if (typeof infer.conname === 'string') return undefined
  const indexElems = infer.indexElems
  if (!Array.isArray(indexElems) || indexElems.length === 0) return undefined
  const columns = new Set<string>()
  for (const elem of indexElems) {
    const column = resolveIndexElemColumn(elem)
    if (column === undefined) return undefined
    columns.add(column)
  }
  return columns
}

const UNRESOLVED_REMEDY =
  'this ON CONFLICT arbiter has no statically-known column list (a named constraint or ' +
  'expression index) — express it as ON CONFLICT (col, ...) so column membership is provable, ' +
  'or only assign EXCLUDED columns or leave columns unchanged'

const KEY_REMEDY =
  'ON CONFLICT arbiter key columns must be assigned EXCLUDED.<col> or left unchanged — any ' +
  'other value can stop this row matching the arbiter on the next replay'

const PREDICATE_REMEDY =
  'columns referenced by the ON CONFLICT partial-index predicate must be assigned ' +
  'EXCLUDED.<col>, left unchanged, or set to a literal the predicate already requires (e.g. ' +
  'NULL under ...IS NULL) — any other value can drop this row out of the arbiter on the next replay'

/**
 * `infer` is `onConflictClause.infer` as produced by @libpg-query/parser. `column` is the
 * assignment target's base column name (`resTarget.name`); `hasIndirection` is whether the
 * target has a subscript/field path (`data['snapshot']`), which is never a same-column no-op
 * regardless of `val`. `val` is the assigned expression (`resTarget.val`).
 */
export function arbiterMembershipVerdict(
  infer: unknown,
  column: string | undefined,
  hasIndirection: boolean,
  val: unknown,
): ArbiterVerdict {
  if (!isRecord(infer) || column === undefined) return { kind: 'not-protected' }
  const keyColumns = resolveKeyColumns(infer)
  const bareSelfRef = !hasIndirection && isBareSelfReference(val, column)
  const namedConstraintExcludedRef =
    !hasIndirection && typeof infer.conname === 'string' && isExcludedReferenceToColumn(val, column)

  if (keyColumns === undefined) {
    if (bareSelfRef) return { kind: 'not-protected' }
    if (namedConstraintExcludedRef) return { kind: 'safe' }
    return {
      kind: 'violation',
      form: 'a value under an unresolvable conflict arbiter',
      remedy: UNRESOLVED_REMEDY,
    }
  }

  const isKeyColumn = keyColumns.has(column)
  const predicateColumns = new Set<string>()
  if (isRecord(infer.whereClause)) collectColumnRefs(infer.whereClause, predicateColumns)
  if (!isKeyColumn && !predicateColumns.has(column)) return { kind: 'not-protected' }

  if (bareSelfRef) return { kind: 'safe' }
  if (isKeyColumn && !hasIndirection && isExcludedReferenceToColumn(val, column)) {
    return { kind: 'safe' }
  }
  if (!isKeyColumn && !hasIndirection) {
    const nullProvenColumns = new Set<string>()
    collectNullProvenColumns(infer.whereClause, nullProvenColumns)
    if (nullProvenColumns.has(column) && isNullLiteral(val)) return { kind: 'safe' }
  }

  return isKeyColumn
    ? {
        kind: 'violation',
        form: 'a value that may not preserve the conflict arbiter key',
        remedy: KEY_REMEDY,
      }
    : {
        kind: 'violation',
        form: "a value that may not preserve the conflict arbiter's partial-index predicate",
        remedy: PREDICATE_REMEDY,
      }
}
