import type { PostgresSqlConflict, PostgresSqlInsert } from 'no-mistakes'
import { projectGeneratedArbiterInput } from 'vouchington-tooling/pg-schema-snapshot'

import { arbiterMembershipVerdict } from './on-conflict-arbiter.mts'
import {
  isBareSelfReference,
  selfReferenceColumn,
  type ExpressionNode,
} from './on-conflict-column-refs.mts'
import { isSafeVolatileFallback, volatileForm } from './on-conflict-excluded-provenance.mts'

export type ConvergenceVerdict =
  | { convergent: true }
  | { convergent: false; column: string; form: string; remedy?: string }

function isConvergentNode(
  node: ExpressionNode,
  shielded: boolean,
  targetColumn: string | undefined,
  insert: PostgresSqlInsert,
): boolean {
  if (!node.childrenComplete) return false
  const self = selfReferenceColumn(node)
  if (self !== undefined) return shielded && targetColumn === self
  if (node.root.kind === 'subquery' || node.root.kind === 'parameter') return false
  if (volatileForm(node, insert) !== undefined) return false

  if (node.root.kind === 'functionCall') {
    const name = node.root.name.parts.at(-1)?.identity
    const args = node.children.filter(child => child.role === 'argument')
    if (name === 'coalesce') return isConvergentCoalesceArgs(args, targetColumn, insert)
    if (name === 'greatest' || name === 'least') {
      return args.every(arg => isConvergentNode(arg, true, targetColumn, insert))
    }
  }
  return node.children.every(child => isConvergentNode(child, false, targetColumn, insert))
}

function isConvergentCoalesceArgs(
  args: readonly ExpressionNode[],
  targetColumn: string | undefined,
  insert: PostgresSqlInsert,
): boolean {
  let selfRefSeen = false
  for (const arg of args) {
    if (volatileForm(arg, insert) !== undefined) {
      if (!selfRefSeen || !isSafeVolatileFallback(arg, insert)) return false
    } else if (!isConvergentNode(arg, true, targetColumn, insert)) {
      return false
    }
    if (targetColumn !== undefined && isBareSelfReference(arg, targetColumn)) selfRefSeen = true
  }
  return true
}

function failure(column: string, form: string, remedy?: string): ConvergenceVerdict {
  return { convergent: false, column, form, remedy }
}

/** Replay convergence over normalized expression and conflict facts. */
export function isConvergentOnConflict(
  conflict: PostgresSqlConflict,
  insert: PostgresSqlInsert,
): ConvergenceVerdict {
  if (conflict.action.kind !== 'doUpdate') return { convergent: true }
  const input = projectGeneratedArbiterInput(conflict)
  if (!input.complete) return failure('?', 'an incomplete conflict expression')

  for (const [index, assignment] of conflict.action.assignments.entries()) {
    const projected = input.assignments[index]
    const column = projected?.columns.length === 1 ? projected.columns[0]! : '?'
    if (!projected?.complete || !assignment.complete || column === '?') {
      return failure(column, 'an incomplete conflict assignment')
    }
    const arbiter = arbiterMembershipVerdict(conflict, input, assignment, projected)
    if (arbiter.kind === 'violation') {
      return failure(column, arbiter.form, arbiter.remedy)
    }
    if (arbiter.kind === 'safe') continue

    const indirection = assignment.target?.subscripts ?? []
    if (indirection.some(part => !isConvergentNode(part, false, undefined, insert))) {
      return failure(column, 'a subscript/field-path index containing a self-reference')
    }
    const targetColumn = projected.hasIndirection ? undefined : column
    if (
      (targetColumn !== undefined && isBareSelfReference(assignment.expression, targetColumn)) ||
      isConvergentNode(assignment.expression, false, targetColumn, insert)
    ) {
      continue
    }
    const volatile = volatileForm(assignment.expression, insert)
    if (volatile !== undefined) {
      return failure(column, `a volatile value (${volatile})`)
    }
    return failure(column, 'a non-convergent expression')
  }
  return { convergent: true }
}

export { isGuardedSelect } from './on-conflict-guarded-select.mts'
