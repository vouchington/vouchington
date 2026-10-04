import ts from 'typescript'

/** Only writes already reached in the identifier's function can supply its provenance. */
export function priorCarrierWrites(
  use: ts.Node,
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
): ts.Expression[] {
  const writes: ts.Expression[] = []
  const scope = symbol.declarations?.map(owningFunction).find(Boolean)
  const source = use.getSourceFile()
  const before = use.getStart(source)
  const visit = (candidate: ts.Node): void => {
    if (candidate.getStart(source) >= before) return
    if (
      ts.isBinaryExpression(candidate) &&
      candidate.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      rootIdentifier(candidate.left, checker) === symbol &&
      owningFunction(candidate) === scope
    )
      writes.push(candidate.right)
    ts.forEachChild(candidate, visit)
  }
  visit(source)
  return writes
}

function rootIdentifier(expression: ts.Expression, checker: ts.TypeChecker): ts.Symbol | undefined {
  let current = expression
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    current = current.expression
  }
  if (!ts.isIdentifier(current)) return undefined
  return ts.isShorthandPropertyAssignment(current.parent) && current.parent.name === current
    ? (checker.getShorthandAssignmentValueSymbol(current.parent) ??
        checker.getSymbolAtLocation(current))
    : checker.getSymbolAtLocation(current)
}

function owningFunction(node: ts.Node): ts.Node | undefined {
  let current: ts.Node | undefined = node
  while (current && !ts.isFunctionLike(current)) current = current.parent
  return current && ts.isFunctionLike(current) ? current : undefined
}
