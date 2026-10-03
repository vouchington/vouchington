import ts from 'typescript'

export type UuidValidatorTrust = (node: ts.Identifier, checker: ts.TypeChecker) => boolean

export function isRequestIdAlias(
  expression: ts.Identifier,
  checker: ts.TypeChecker,
  context: ts.Symbol | undefined,
  visited: Set<ts.Symbol>,
): boolean {
  const symbol = checker.getSymbolAtLocation(expression)
  if (!symbol || visited.has(symbol)) return false
  const next = new Set(visited).add(symbol)
  return (symbol.declarations ?? []).some(
    declaration =>
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer &&
      isRequestIdInitializer(declaration.initializer, checker, context, next),
  )
}

function isRequestIdInitializer(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  context: ts.Symbol | undefined,
  visited: Set<ts.Symbol>,
): boolean {
  if (isRequestIdQueryRead(expression, checker, context)) return true
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)) {
    return isRequestIdInitializer(expression.expression, checker, context, visited)
  }
  if (ts.isIdentifier(expression)) {
    return isRequestIdAlias(expression, checker, context, visited)
  }
  if (!ts.isConditionalExpression(expression)) return false
  return (
    isStringTypeOfRequestId(expression.condition, checker, context) &&
    isRequestIdQueryRead(expression.whenTrue, checker, context) &&
    ts.isIdentifier(expression.whenFalse) &&
    expression.whenFalse.text === 'undefined'
  )
}

function isStringTypeOfRequestId(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  context: ts.Symbol | undefined,
): boolean {
  if (
    !ts.isBinaryExpression(expression) ||
    expression.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken
  ) {
    return false
  }
  const [typeofValue, stringValue] = [expression.left, expression.right]
  return (
    ts.isTypeOfExpression(typeofValue) &&
    ts.isStringLiteral(stringValue) &&
    stringValue.text === 'string' &&
    isRequestIdQueryRead(typeofValue.expression, checker, context)
  )
}

function isRequestIdQueryRead(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  context: ts.Symbol | undefined,
): boolean {
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)) {
    return isRequestIdQueryRead(expression.expression, checker, context)
  }
  if (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === 'request_id' &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'query'
  ) {
    return isIdentifierSymbol(expression.expression.expression, checker, context)
  }
  return (
    ts.isElementAccessExpression(expression) &&
    ts.isStringLiteralLike(expression.argumentExpression) &&
    expression.argumentExpression.text === 'request_id' &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'query' &&
    isIdentifierSymbol(expression.expression.expression, checker, context)
  )
}

export function isImportedUuidValidator(
  node: ts.Identifier,
  checker: ts.TypeChecker,
  trustedModule: string,
): boolean {
  const symbol = checker.getSymbolAtLocation(node)
  if (!symbol) return false
  const imports = node.getSourceFile().statements.flatMap(statement => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== trustedModule ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    )
      return []
    return statement.importClause.namedBindings.elements.filter(
      specifier =>
        (specifier.propertyName?.text ?? specifier.name.text) === 'isUUID' &&
        specifier.name.text === node.text,
    )
  })
  const match = imports.some(specifier => {
    const local = checker.getSymbolAtLocation(specifier.name)
    if (!local) return false
    if (local === symbol) return true
    const localTarget = local.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(local) : local
    const useTarget =
      symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
    return localTarget === useTarget
  })
  return match
}

export function unwrapIdentifier(expression: ts.Expression | undefined): ts.Identifier | undefined {
  let current = expression
  while (current && (ts.isParenthesizedExpression(current) || ts.isAsExpression(current))) {
    current = current.expression
  }
  return current && ts.isIdentifier(current) ? current : undefined
}

export function isIdentifierSymbol(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  expected: ts.Symbol | undefined,
): boolean {
  return (
    !!expected &&
    ts.isIdentifier(expression) &&
    checker.getSymbolAtLocation(expression) === expected
  )
}
