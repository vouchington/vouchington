import type { PostgresSqlExpression } from 'no-mistakes'

import {
  excludedColumnRefName,
  isBareSelfReference,
  isExcludedReferenceToColumn,
  selfReferenceColumn,
  type ExpressionNode,
} from './on-conflict-column-refs.mts'

function conjunctiveProof(
  node: ExpressionNode | null,
  match: (part: ExpressionNode) => string | undefined,
  out: Set<string>,
): void {
  if (node === null || !node.childrenComplete) return
  if (node.root.kind === 'parenthesized') {
    const expression = node.children.find(child => child.role === 'parenthesizedExpression')
    if (expression !== undefined) conjunctiveProof(expression, match, out)
    return
  }
  if (node.root.kind === 'binary' && node.root.operator.toUpperCase() === 'AND') {
    for (const child of node.children) conjunctiveProof(child, match, out)
    return
  }
  const column = match(node)
  if (column !== undefined) out.add(column)
}

function nullTestColumn(node: ExpressionNode, negated: boolean): string | undefined {
  if (node.root.kind !== 'nullTest' || node.root.negated !== negated) return undefined
  const operand = node.children.find(child => child.role === 'nullOperand')
  return operand === undefined ? undefined : selfReferenceColumn(operand)
}

export function collectNullProvenColumns(
  predicate: PostgresSqlExpression | null,
  out: Set<string>,
): void {
  conjunctiveProof(predicate, node => nullTestColumn(node, false), out)
}

export function isDistinctFromExcluded(node: PostgresSqlExpression, column: string): boolean {
  if (node.root.kind !== 'distinctness' || node.root.negated) return false
  const left = node.children.find(child => child.role === 'distinctLeft')
  const right = node.children.find(child => child.role === 'distinctRight')
  return (
    left !== undefined &&
    right !== undefined &&
    ((isBareSelfReference(left, column) && isExcludedReferenceToColumn(right, column)) ||
      (isBareSelfReference(right, column) && isExcludedReferenceToColumn(left, column)))
  )
}

function excludedNotNullColumn(node: ExpressionNode): string | undefined {
  if (node.root.kind !== 'nullTest' || !node.root.negated) return undefined
  const operand = node.children.find(child => child.role === 'nullOperand')
  return operand === undefined ? undefined : excludedColumnRefName(operand)
}

export function isNullUntilProvenNonNull(
  predicate: PostgresSqlExpression | null,
  column: string,
): boolean {
  const nullProven = new Set<string>()
  collectNullProvenColumns(predicate, nullProven)
  if (!nullProven.has(column)) return false
  const excludedNotNull = new Set<string>()
  conjunctiveProof(predicate, excludedNotNullColumn, excludedNotNull)
  return excludedNotNull.has(column)
}
