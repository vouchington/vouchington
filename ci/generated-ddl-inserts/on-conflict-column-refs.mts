import type {
  PostgresSqlExpression,
  PostgresSqlExpressionChild,
  PostgresSqlName,
} from 'no-mistakes'

export type ExpressionNode = PostgresSqlExpression | PostgresSqlExpressionChild

function columnName(name: PostgresSqlName): string | undefined {
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
