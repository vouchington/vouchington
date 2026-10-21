import type {
  PostgresSqlConflict,
  PostgresSqlExpression,
  PostgresSqlInsert,
  PostgresSqlTrigger,
} from 'no-mistakes'

import {
  isDistinctFromExcluded,
  isExcludedReferenceToColumn,
  isNullUntilProvenNonNull,
} from './on-conflict-column-refs.mts'

const REPLAY_SAFE_TRIGGER_FUNCTIONS = new Set([
  'fn_update_updated_at',
  'fn_lock_agent_moderation_transparency_agent',
  'fn_project_topic_aliases',
  // Validation and transaction-scoped fencing do not mutate replayed row state.
  'fn_ensure_active_topic_references',
])

function hasEvent(trigger: PostgresSqlTrigger, kind: 'insert' | 'update'): boolean {
  return trigger.eventFacts.some(event => event.kind === kind)
}

function firesUnconditionally(trigger: PostgresSqlTrigger): boolean {
  if (trigger.forEach !== 'FOR EACH ROW') {
    return hasEvent(trigger, 'insert') || hasEvent(trigger, 'update')
  }
  return hasEvent(trigger, 'insert') && trigger.timing === 'BEFORE'
}

function watchedColumns(trigger: PostgresSqlTrigger): ReadonlySet<string> | undefined {
  const update = trigger.eventFacts.find(event => event.kind === 'update')
  if (!update?.updateOf) return undefined
  return new Set(update.updateColumns.map(column => column.identity))
}

function whereProvesNoReplay(
  predicate: PostgresSqlExpression | null | undefined,
  columns: ReadonlySet<string>,
  excludedAssigned: ReadonlySet<string>,
): boolean {
  if (predicate === null || predicate === undefined || !predicate.childrenComplete) return false
  for (const column of columns) {
    if (!excludedAssigned.has(column)) return false
    if (isDistinctFromExcluded(predicate, column)) continue
    if (isNullUntilProvenNonNull(predicate, column)) continue
    return false
  }
  return true
}

function triggerIsUnsafe(
  trigger: PostgresSqlTrigger,
  assigned: ReadonlySet<string>,
  excludedAssigned: ReadonlySet<string>,
  predicate: PostgresSqlExpression | null | undefined,
): boolean {
  const unconditional = firesUnconditionally(trigger)
  if (!unconditional && !(hasEvent(trigger, 'update') && trigger.forEach === 'FOR EACH ROW')) {
    return false
  }
  const functionName = trigger.function?.parts.at(-1)?.identity
  if (functionName !== undefined && REPLAY_SAFE_TRIGGER_FUNCTIONS.has(functionName)) return false
  if (unconditional) return true
  const watched = watchedColumns(trigger)
  const candidates =
    watched === undefined ? assigned : new Set([...assigned].filter(column => watched.has(column)))
  if (candidates.size === 0) return false
  if (trigger.timing === 'BEFORE') return true
  return !whereProvesNoReplay(predicate, candidates, excludedAssigned)
}

export function insertTableName(insert: PostgresSqlInsert): string | undefined {
  return insert.table?.parts.at(-1)?.identity
}

export function assignedColumnsFromOnConflict(conflict: PostgresSqlConflict): ReadonlySet<string> {
  if (conflict.action.kind !== 'doUpdate') return new Set()
  return new Set(
    conflict.action.assignments.flatMap(assignment =>
      assignment.columns.flatMap(name => {
        const column = name.parts.at(-1)?.identity
        return column === undefined ? [] : [column]
      }),
    ),
  )
}

export function excludedAssignedColumnsFromOnConflict(
  conflict: PostgresSqlConflict,
): ReadonlySet<string> {
  const out = new Set<string>()
  if (conflict.action.kind !== 'doUpdate') return out
  for (const assignment of conflict.action.assignments) {
    if (assignment.columns.length !== 1) continue
    const column = assignment.columns[0]?.parts.at(-1)?.identity
    if (column && isExcludedReferenceToColumn(assignment.expression, column)) out.add(column)
  }
  return out
}

/** Unknown trigger DDL remains unsafe. */
export function replayUnsafeTrigger(
  triggers: readonly (PostgresSqlTrigger | undefined)[],
  assignedColumns: ReadonlySet<string>,
  excludedAssignedColumns: ReadonlySet<string>,
  conflictWhereClause: PostgresSqlExpression | null | undefined,
): boolean {
  return triggers.some(
    trigger =>
      trigger === undefined ||
      triggerIsUnsafe(trigger, assignedColumns, excludedAssignedColumns, conflictWhereClause),
  )
}
