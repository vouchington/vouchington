import ts from 'typescript'

export function isQueryRoot(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  contexts: Set<ts.Symbol>,
  querySymbols: Set<ts.Symbol>,
  visited = new Set<ts.Symbol>(),
): boolean {
  if (ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
    return isQueryRoot(expression.expression, checker, contexts, querySymbols, visited)
  }
  if (ts.isParenthesizedExpression(expression))
    return isQueryRoot(expression.expression, checker, contexts, querySymbols, visited)
  if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'query') {
    return contextRoot(expression.expression, checker, contexts)
  }
  if (
    ts.isElementAccessExpression(expression) &&
    expression.argumentExpression &&
    ts.isStringLiteralLike(expression.argumentExpression) &&
    expression.argumentExpression.text === 'query'
  ) {
    return contextRoot(expression.expression, checker, contexts)
  }
  if (ts.isIdentifier(expression)) {
    const symbol = checker.getSymbolAtLocation(expression)
    if (!symbol || visited.has(symbol)) return false
    if (querySymbols.has(symbol)) return true
    visited.add(symbol)
    for (const declaration of symbol.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        return isQueryRoot(declaration.initializer, checker, contexts, querySymbols, visited)
      }
    }
  }
  return false
}

export function contextRoot(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  contexts: Set<ts.Symbol>,
): boolean {
  if (ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
    return contextRoot(expression.expression, checker, contexts)
  }
  if (ts.isParenthesizedExpression(expression))
    return contextRoot(expression.expression, checker, contexts)
  if (ts.isIdentifier(expression)) {
    const symbol = checker.getSymbolAtLocation(expression)
    return !!symbol && contexts.has(symbol)
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return contextRoot(expression.expression, checker, contexts)
  }
  return false
}
