import type { PostgresSqlConflict, PostgresSqlInsertAssignment } from 'no-mistakes'
import type {
  GeneratedArbiterAssignmentInput,
  GeneratedArbiterInput,
} from 'vouchington-tooling/pg-schema-snapshot'

import {
  collectNullProvenColumns,
  isBareSelfReference,
  isExcludedReferenceToColumn,
  isNullLiteral,
} from './on-conflict-column-refs.mts'

export type ArbiterVerdict =
  | { kind: 'safe' }
  | { kind: 'not-protected' }
  | { kind: 'violation'; form: string; remedy: string }

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

/** Keep the matched row in the same conflict arbiter after replay. */
export function arbiterMembershipVerdict(
  conflict: PostgresSqlConflict,
  input: GeneratedArbiterInput,
  assignment: PostgresSqlInsertAssignment,
  projected: GeneratedArbiterAssignmentInput,
): ArbiterVerdict {
  const column = projected.columns.length === 1 ? projected.columns[0] : undefined
  if (!input.complete || !projected.complete || column === undefined) {
    return {
      kind: 'violation',
      form: 'an incomplete conflict assignment',
      remedy: UNRESOLVED_REMEDY,
    }
  }
  const bareSelfRef =
    !projected.hasIndirection && isBareSelfReference(assignment.expression, column)
  const excludedRef =
    !projected.hasIndirection && isExcludedReferenceToColumn(assignment.expression, column)
  const keyColumns = input.keyColumns
  if (keyColumns === undefined) {
    if (bareSelfRef) return { kind: 'not-protected' }
    if (conflict.target.kind === 'constraint' && excludedRef) return { kind: 'safe' }
    return {
      kind: 'violation',
      form: 'a value under an unresolvable conflict arbiter',
      remedy: UNRESOLVED_REMEDY,
    }
  }

  const key = keyColumns.has(column)
  if (!key && !input.predicateColumns.has(column)) return { kind: 'not-protected' }
  if (bareSelfRef || (key && excludedRef)) return { kind: 'safe' }
  if (!key && !projected.hasIndirection && isNullLiteral(assignment.expression)) {
    const nullProven = new Set<string>()
    collectNullProvenColumns(conflict.predicate, nullProven)
    if (nullProven.has(column)) return { kind: 'safe' }
  }
  return key
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
