import ts from 'typescript'

export function getStringLiteralValue(node: ts.Node | undefined): string | undefined {
  if (!node) return undefined
  const value = unwrapExpression(node)
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text
  if (ts.isLiteralTypeNode(value) && ts.isStringLiteral(value.literal)) return value.literal.text
  return undefined
}

export function unwrapExpression<T extends ts.Node>(node: T): T {
  let current: ts.Node = node
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression
  }
  return current as T
}

export function walkAst(node: ts.Node, onNode: (node: ts.Node) => void): void {
  onNode(node)
  ts.forEachChild(node, child => walkAst(child, onNode))
}
