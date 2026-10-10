import type { PostgresSqlTrigger } from 'no-mistakes'

import {
  isDistinctFromExcluded,
  isExcludedReferenceToColumn,
  isNullUntilProvenNonNull,
} from './on-conflict-column-refs.mts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Test-time judge for TypeScript-generated config-driven SQL
// (`generated-ddl-insert-invariants.mts`). Tracked `.sql` files use no-mistakes
// `postgres-idempotent-insert`.

/**
 * Whether a value-convergent `ON CONFLICT DO UPDATE` (per `isConvergentOnConflict`) can still
 * corrupt state via a trigger — `isConvergentOnConflict` never inspects triggers or the DO
 * UPDATE's own WHERE clause. A trigger is:
 * - **Unconditional** (unsafe unless allowlisted, no WHERE/column exemption possible): `FOR EACH
 *   STATEMENT` on INSERT or UPDATE (fires once per statement regardless of affected rows), or
 *   `FOR EACH ROW BEFORE INSERT` (fires before Postgres checks for a conflict; `AFTER INSERT` is
 *   safe since it only runs once a row commits).
 * - **Row-level UPDATE** (`FOR EACH ROW`, any timing): unsafe unless (1) allowlisted in
 *   `REPLAY_SAFE_TRIGGER_FUNCTIONS`, (2) it watches no column this ON CONFLICT assigns, or (3) it
 *   is `AFTER`-timing and the WHERE clause proves a no-op for every watched+assigned column, with
 *   the SET target for that column assigning `EXCLUDED.col` verbatim (a `BEFORE` trigger can
 *   rewrite `NEW.col` before storage, so no WHERE proof can vouch for what it lets through).
 * - **Out of scope**: `AFTER INSERT` row triggers, DELETE/TRUNCATE triggers.
 */

const REPLAY_SAFE_TRIGGER_FUNCTIONS = new Set([
  // Only stamps updated_at; every replay produces a fresh, disposable timestamp.
  'fn_update_updated_at',
  // Only flips a moderation lock derived from deleted_at; not a column any config-driven
  // generator's ON CONFLICT assigns.
  'fn_lock_agent_moderation_transparency_agent',
  'fn_project_topic_aliases', // Sorted alias cache; empty transition tables do no work.
])

function hasEvent(trig: PostgresSqlTrigger, kind: 'insert' | 'update'): boolean {
  return trig.eventFacts.some(event => event.kind === kind)
}

function firesOnUpdateForEachRow(trig: PostgresSqlTrigger): boolean {
  return hasEvent(trig, 'update') && trig.forEach === 'FOR EACH ROW'
}

// A FOR EACH STATEMENT trigger on INSERT or UPDATE fires once per statement regardless of
// whether any row was actually inserted/updated; a FOR EACH ROW BEFORE INSERT trigger fires for
// the proposed row before Postgres even checks for a conflict. Neither is gated by the DO
// UPDATE's WHERE clause or by which columns it assigns.
function firesUnconditionally(trig: PostgresSqlTrigger): boolean {
  if (trig.forEach !== 'FOR EACH ROW') return hasEvent(trig, 'insert') || hasEvent(trig, 'update')
  return hasEvent(trig, 'insert') && trig.timing === 'BEFORE'
}

function triggerFunctionName(trig: PostgresSqlTrigger): string | undefined {
  return trig.function?.parts.at(-1)?.value
}

// `undefined` means the trigger has no `UPDATE OF <cols>` restriction and watches every column.
function triggerWatchedColumns(trig: PostgresSqlTrigger): ReadonlySet<string> | undefined {
  const update = trig.eventFacts.find(event => event.kind === 'update')
  if (!update?.updateOf) return undefined
  return new Set(update.updateColumns.map(column => column.identity))
}

// A WHERE-proof for `column` only holds if the SET target for that exact column assigns
// `EXCLUDED.column` verbatim — see the module docstring's row-level-UPDATE criterion 3.
function whereProvesNoReplay(
  whereClause: unknown,
  columns: ReadonlySet<string>,
  excludedAssignedColumns: ReadonlySet<string>,
): boolean {
  for (const column of columns) {
    if (!excludedAssignedColumns.has(column)) return false
    if (isDistinctFromExcluded(whereClause, column)) continue
    if (isNullUntilProvenNonNull(whereClause, column)) continue
    return false
  }
  return true
}

function isTriggerReplayUnsafe(
  trig: PostgresSqlTrigger,
  assignedColumns: ReadonlySet<string>,
  excludedAssignedColumns: ReadonlySet<string>,
  conflictWhereClause: unknown,
): boolean {
  const unconditional = firesUnconditionally(trig)
  if (!unconditional && !firesOnUpdateForEachRow(trig)) return false
  const functionName = triggerFunctionName(trig)
  if (functionName !== undefined && REPLAY_SAFE_TRIGGER_FUNCTIONS.has(functionName)) return false
  if (unconditional) return true
  const watchedColumns = triggerWatchedColumns(trig)
  const candidateColumns =
    watchedColumns === undefined
      ? assignedColumns
      : new Set([...assignedColumns].filter(column => watchedColumns.has(column)))
  if (candidateColumns.size === 0) return false
  // BEFORE fires before the row is stored and can rewrite NEW.<col>, so no WHERE proof can vouch
  // for what it lets through — only AFTER reaches the WHERE-proof exemption.
  if (trig.timing === 'BEFORE') return true
  return !whereProvesNoReplay(conflictWhereClause, candidateColumns, excludedAssignedColumns)
}

/** The target table's own name (`insert.relation.relname`); ignores `.schemaname`, matching how
 * `schema.json`'s table keys are unqualified. */
export function insertTableName(insert: unknown): string | undefined {
  if (!isRecord(insert) || !isRecord(insert.relation)) return undefined
  return typeof insert.relation.relname === 'string' ? insert.relation.relname : undefined
}

function onConflictSetTargets(onConflict: unknown): { name: string; val: unknown }[] {
  if (!isRecord(onConflict) || !Array.isArray(onConflict.targetList)) return []
  const out: { name: string; val: unknown }[] = []
  for (const target of onConflict.targetList) {
    if (
      isRecord(target) &&
      isRecord(target.ResTarget) &&
      typeof target.ResTarget.name === 'string'
    ) {
      out.push({ name: target.ResTarget.name, val: target.ResTarget.val })
    }
  }
  return out
}

/** The columns an `ON CONFLICT DO UPDATE`'s SET list assigns, from `onConflictClause.targetList`. */
export function assignedColumnsFromOnConflict(onConflict: unknown): ReadonlySet<string> {
  return new Set(onConflictSetTargets(onConflict).map(target => target.name))
}

/** The subset of `assignedColumnsFromOnConflict` whose SET target assigns `EXCLUDED.<col>`
 * verbatim — the only shape a WHERE-clause no-op proof can be tied back to (see the module
 * docstring's row-level-UPDATE criterion 3). */
export function excludedAssignedColumnsFromOnConflict(onConflict: unknown): ReadonlySet<string> {
  const out = new Set<string>()
  for (const target of onConflictSetTargets(onConflict)) {
    if (isExcludedReferenceToColumn(target.val, target.name)) out.add(target.name)
  }
  return out
}

/** The target table's parsed `CREATE TRIGGER` facts. `undefined` means parsing failed. */
export function replayUnsafeTrigger(
  triggers: readonly (PostgresSqlTrigger | undefined)[],
  assignedColumns: ReadonlySet<string>,
  excludedAssignedColumns: ReadonlySet<string>,
  conflictWhereClause: unknown,
): boolean {
  for (const trig of triggers) {
    // Fail closed: a trigger the parser cannot understand is unsafe.
    if (
      !trig ||
      isTriggerReplayUnsafe(trig, assignedColumns, excludedAssignedColumns, conflictWhereClause)
    ) {
      return true
    }
  }
  return false
}
