import { resolveKeyColumns } from './on-conflict-arbiter.mts'
import { collectColumnRefs, isBareSelfReference } from './on-conflict-column-refs.mts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
// Test-time judge for TypeScript-generated config-driven SQL
// (`generated-ddl-insert-invariants.mts`). Tracked `.sql` files use no-mistakes
// `postgres-idempotent-insert`.

/**
 * Whether an `ON CONFLICT DO UPDATE` assigns a *source* column of a STORED generated column that
 * is itself arbiter-protected (a KEY column from `infer.indexElems`, or referenced in the
 * arbiter's partial-index predicate `infer.whereClause`) — see `arbiterMembershipVerdict` in
 * on-conflict-arbiter.mts for that protection. Changing a source column recomputes the generated
 * column on write, which can move the row out of the arbiter even though the generated column
 * itself was never assigned; the next replay then fails to match the same row.
 *
 * `generatedDependencies` maps each STORED generated column to the source columns its expression
 * reads (see `generatedDependenciesForTable` in schema-snapshot-facts.mts). Unlike
 * `arbiterMembershipVerdict`'s own KEY-column rule, `EXCLUDED.<source column>` is never treated as
 * safe here: Postgres only guarantees `EXCLUDED.<col>` equals the arbiter's matched row for the
 * KEY/predicate column itself, not for an upstream column feeding its generated expression — so
 * only a bare self-reference (`col = col`, always a no-op) is safe; every other value fails closed.
 *
 * When the arbiter's key columns cannot be statically resolved (`resolveKeyColumns` returns
 * `undefined` — a named constraint, or an expression index element referencing zero or multiple
 * columns), this does not defer to `arbiterMembershipVerdict`'s own named-constraint carve-out,
 * which treats `EXCLUDED.<col>` as safe there. That carve-out is sound for
 * `arbiterMembershipVerdict`'s narrower question — does this preserve *this* column's own arbiter
 * match — because Postgres guarantees a full, non-partial named constraint's own indexed value is
 * equal between the matched and excluded rows. It does not extend to a *different* generated
 * column the same unresolved constraint might also cover: two rows can agree on a generated value
 * while disagreeing on the source columns that produced it (e.g. `a || b` colliding on `'abc'`
 * from `('ab','c')` and `('a','bc')`), so `EXCLUDED.<source>` is not provably safe there. Since
 * which columns an unresolved constraint actually covers is unknown, every source column of every
 * generated column on the table is conservatively treated as potentially arbiter-protected in
 * that case.
 */
export type GeneratedArbiterVerdict =
  | { violation: false }
  | { violation: true; column: string; generatedColumn: string }

export function generatedArbiterViolation(
  onConflictClause: unknown,
  generatedDependencies: ReadonlyMap<string, ReadonlySet<string>>,
): GeneratedArbiterVerdict {
  if (!isRecord(onConflictClause) || !isRecord(onConflictClause.infer)) {
    return { violation: false }
  }
  const infer = onConflictClause.infer
  const keyColumns = resolveKeyColumns(infer)

  let arbiterColumns: ReadonlySet<string>
  if (keyColumns === undefined) {
    arbiterColumns = new Set(generatedDependencies.keys())
  } else {
    const predicateColumns = new Set<string>()
    collectColumnRefs(infer.whereClause, predicateColumns)
    arbiterColumns = new Set([...keyColumns, ...predicateColumns])
  }

  const protectedSources = new Map<string, string>()
  for (const arbiterColumn of arbiterColumns) {
    const sources = generatedDependencies.get(arbiterColumn)
    if (sources === undefined) continue
    for (const source of sources) protectedSources.set(source, arbiterColumn)
  }
  if (protectedSources.size === 0) return { violation: false }

  const targetList = onConflictClause.targetList
  if (!Array.isArray(targetList)) return { violation: false }

  for (const target of targetList) {
    if (!isRecord(target) || !isRecord(target.ResTarget)) continue
    const resTarget = target.ResTarget
    if (typeof resTarget.name !== 'string') continue
    const generatedColumn = protectedSources.get(resTarget.name)
    if (generatedColumn === undefined) continue
    const hasIndirection = Array.isArray(resTarget.indirection) && resTarget.indirection.length > 0
    if (!hasIndirection && isBareSelfReference(resTarget.val, resTarget.name)) continue
    return { violation: true, column: resTarget.name, generatedColumn }
  }
  return { violation: false }
}
