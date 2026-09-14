import { parseSync } from '@libpg-query/parser'

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
 * UPDATE's own WHERE clause. Timing/event bits verified empirically against @libpg-query/parser's
 * `CreateTrigStmt` shape. A trigger is:
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

const TRIGGER_TYPE_BEFORE = 2
const TRIGGER_EVENT_INSERT = 4
const TRIGGER_EVENT_UPDATE = 16

const REPLAY_SAFE_TRIGGER_FUNCTIONS = new Set([
  // Only stamps updated_at; every replay produces a fresh, disposable timestamp.
  'fn_update_updated_at',
  // Only flips a moderation lock derived from deleted_at; not a column any config-driven
  // generator's ON CONFLICT assigns.
  'fn_lock_agent_moderation_transparency_agent',
])

function parseTrigger(trigger: unknown): Record<string, unknown> | undefined {
  if (isRecord(trigger)) {
    return isRecord(trigger.CreateTrigStmt) ? trigger.CreateTrigStmt : undefined
  }
  if (typeof trigger !== 'string') return undefined
  try {
    const parsed = parseSync(trigger) as { stmts?: unknown[] }
    const stmtNode = isRecord(parsed.stmts?.[0]) ? parsed.stmts[0].stmt : undefined
    return isRecord(stmtNode) && isRecord(stmtNode.CreateTrigStmt)
      ? stmtNode.CreateTrigStmt
      : undefined
  } catch {
    return undefined
  }
}

function hasEvent(trig: Record<string, unknown>, bit: number): boolean {
  return typeof trig.events === 'number' && (trig.events & bit) === bit
}

function firesOnUpdateForEachRow(trig: Record<string, unknown>): boolean {
  return hasEvent(trig, TRIGGER_EVENT_UPDATE) && trig.row === true
}

// A FOR EACH STATEMENT trigger on INSERT or UPDATE fires once per statement regardless of
// whether any row was actually inserted/updated; a FOR EACH ROW BEFORE INSERT trigger fires for
// the proposed row before Postgres even checks for a conflict. Neither is gated by the DO
// UPDATE's WHERE clause or by which columns it assigns.
function firesUnconditionally(trig: Record<string, unknown>): boolean {
  if (trig.row !== true)
    return hasEvent(trig, TRIGGER_EVENT_INSERT) || hasEvent(trig, TRIGGER_EVENT_UPDATE)
  return hasEvent(trig, TRIGGER_EVENT_INSERT) && trig.timing === TRIGGER_TYPE_BEFORE
}

function triggerFunctionName(trig: Record<string, unknown>): string | undefined {
  const funcname = trig.funcname
  if (!Array.isArray(funcname)) return undefined
  const last = funcname.at(-1)
  return isRecord(last) && isRecord(last.String) && typeof last.String.sval === 'string'
    ? last.String.sval
    : undefined
}

// `undefined` means the trigger has no `UPDATE OF <cols>` restriction and watches every column.
function triggerWatchedColumns(trig: Record<string, unknown>): Set<string> | undefined {
  const columns = trig.columns
  if (!Array.isArray(columns)) return undefined
  const out = new Set<string>()
  for (const column of columns) {
    if (isRecord(column) && isRecord(column.String) && typeof column.String.sval === 'string') {
      out.add(column.String.sval)
    }
  }
  return out
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
  trig: Record<string, unknown>,
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
  if (trig.timing === TRIGGER_TYPE_BEFORE) return true
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

/** `triggers` are the target table's own `CREATE TRIGGER ...` DDL strings (or already-parsed
 * `{ CreateTrigStmt }` nodes, for tests) — typically `schema.json`'s per-table `triggers` map. */
export function replayUnsafeTrigger(
  triggers: readonly unknown[],
  assignedColumns: ReadonlySet<string>,
  excludedAssignedColumns: ReadonlySet<string>,
  conflictWhereClause: unknown,
): boolean {
  for (const trigger of triggers) {
    const trig = parseTrigger(trigger)
    // Fail closed, matching every other unknown-shape decision in this module: a trigger this
    // parser cannot understand is judged unsafe, not silently skipped.
    if (
      !trig ||
      isTriggerReplayUnsafe(trig, assignedColumns, excludedAssignedColumns, conflictWhereClause)
    ) {
      return true
    }
  }
  return false
}
