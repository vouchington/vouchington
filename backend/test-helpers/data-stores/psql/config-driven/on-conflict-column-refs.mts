import type {
  PostgresSqlExpression,
  PostgresSqlExpressionChild,
  PostgresSqlName,
} from 'no-mistakes'

export type ExpressionNode = PostgresSqlExpression | PostgresSqlExpressionChild

export function columnName(name: PostgresSqlName): string | undefined {
  return name.parts.at(-1)?.identity
}

function directColumn(node: ExpressionNode): PostgresSqlName | undefined {
  if (node.root.kind === 'columnReference') return node.root.name
  if (node.root.kind !== 'parenthesized') return undefined
  const child = node.children.find(part => part.role === 'parenthesizedExpression')
  return child === undefined ? undefined : directColumn(child)
}

function isExcluded(name: PostgresSqlName): boolean {
  return name.parts.length === 2 && name.parts[0]?.identity === 'excluded'
}

export function selfReferenceColumn(node: ExpressionNode): string | undefined {
  const name = directColumn(node)
  return name === undefined || isExcluded(name) ? undefined : columnName(name)
}

export function excludedColumnRefName(node: ExpressionNode): string | undefined {
  const name = directColumn(node)
  return name !== undefined && isExcluded(name) ? columnName(name) : undefined
}

export function isBareSelfReference(node: ExpressionNode, column: string): boolean {
  return selfReferenceColumn(node) === column
}

export function isExcludedReferenceToColumn(node: ExpressionNode, column: string): boolean {
  return excludedColumnRefName(node) === column
}

export function isNullLiteral(node: ExpressionNode): boolean {
  return node.root.kind === 'literal' && node.root.value.kind === 'null'
}

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

export function isNullUntilProvenNonNull(
  predicate: PostgresSqlExpression | null,
  column: string,
): boolean {
  const nullProven = new Set<string>()
  collectNullProvenColumns(predicate, nullProven)
  if (!nullProven.has(column)) return false
  const excludedNotNull = new Set<string>()
  conjunctiveProof(
    predicate,
    node => {
      if (node.root.kind !== 'nullTest' || !node.root.negated) return undefined
      const operand = node.children.find(child => child.role === 'nullOperand')
      return operand === undefined ? undefined : excludedColumnRefName(operand)
    },
    excludedNotNull,
  )
  return excludedNotNull.has(column)
}
