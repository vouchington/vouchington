import ts from 'typescript'

type Route = { method: string; routeTemplate: string; source: string }

export function findRegistration(
  source: ts.SourceFile,
  route: Route,
  line: number,
): ts.CallExpression {
  let match: ts.CallExpression | undefined
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      source.getLineAndCharacterOfPosition(node.getStart()).line + 1 === line
    ) {
      const method = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text.toUpperCase()
        : undefined
      const template = findRouteCall(node.expression)?.arguments[0]
      if (
        method === route.method &&
        template &&
        ts.isStringLiteralLike(template) &&
        template.text === route.routeTemplate
      ) {
        if (match) throw new Error(`Ambiguous route source ${route.source}`)
        match = node
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!match)
    throw new Error(`Cannot find registered handler for ${keyOf(route)} at ${route.source}`)
  return match
}

export function resolveHandlerNodes(expression: ts.Expression, checker: ts.TypeChecker): ts.Node[] {
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return [expression]
  if (ts.isCallExpression(expression)) {
    const symbol = checker.getSymbolAtLocation(expression.expression)
    const declarations = symbol ? (resolveAlias(symbol, checker).declarations ?? []) : []
    return declarations.flatMap(declaration => {
      const implementation = ts.isVariableDeclaration(declaration)
        ? declaration.initializer
        : ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)
          ? declaration
          : undefined
      if (!implementation) return []
      const body =
        ts.isFunctionDeclaration(implementation) || ts.isMethodDeclaration(implementation)
          ? implementation.body
          : implementation
      if (!body) return []
      if (!ts.isBlock(body)) return resolveHandlerNodes(body, checker)
      const returned: ts.Expression[] = []
      const collect = (node: ts.Node): void => {
        if (node !== body && ts.isFunctionLike(node)) return
        if (ts.isReturnStatement(node) && node.expression) {
          returned.push(node.expression)
          return
        }
        ts.forEachChild(node, collect)
      }
      collect(body)
      return returned.flatMap(result => resolveHandlerNodes(result, checker))
    })
  }
  if (ts.isIdentifier(expression)) {
    const symbol = checker.getSymbolAtLocation(expression)
    return (symbol ? (resolveAlias(symbol, checker).declarations ?? []) : []).flatMap(
      declaration => {
        if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) {
          return declaration.body ? [declaration] : []
        }
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          return resolveHandlerNodes(declaration.initializer, checker)
        }
        return []
      },
    )
  }
  return []
}

export function resolveExpression(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): ts.Expression {
  if (!ts.isIdentifier(expression)) return expression
  const symbol = checker.getSymbolAtLocation(expression)
  for (const declaration of symbol?.declarations ?? []) {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      return resolveExpression(declaration.initializer, checker)
    }
  }
  return expression
}

export function propertyString(
  expression: ts.Expression,
  propertyName: string,
  checker: ts.TypeChecker,
  bindings: Map<ts.Symbol, string>,
): string | undefined {
  const resolved = resolveExpression(expression, checker)
  if (!ts.isObjectLiteralExpression(resolved)) return undefined
  for (const property of resolved.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const name =
      ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
        ? property.name.text
        : undefined
    if (name === propertyName) return resolveString(property.initializer, checker, bindings)
  }
  return undefined
}

export function resolveString(
  expression: ts.Expression | undefined,
  checker: ts.TypeChecker,
  bindings = new Map<ts.Symbol, string>(),
): string | undefined {
  if (!expression) return undefined
  if (ts.isStringLiteralLike(expression)) return expression.text
  if (ts.isParenthesizedExpression(expression)) {
    return resolveString(expression.expression, checker, bindings)
  }
  if (ts.isIdentifier(expression)) {
    const symbol = checker.getSymbolAtLocation(expression)
    const bound = symbol && bindings.get(symbol)
    if (bound) return bound
    for (const declaration of symbol?.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        return resolveString(declaration.initializer, checker, bindings)
      }
    }
  }
  return undefined
}

export function resolvedName(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): string | undefined {
  if (!ts.isIdentifier(expression)) return undefined
  const symbol = checker.getSymbolAtLocation(expression)
  return symbol ? resolveAlias(symbol, checker).getName() : undefined
}

export function hasCarrierRoot(expression: ts.Expression, family: string): boolean {
  let found = false
  const rootName = family === 'path' ? 'params' : family
  const visit = (node: ts.Node): void => {
    if (
      (ts.isPropertyAccessExpression(node) && node.name.text === rootName) ||
      (ts.isElementAccessExpression(node) &&
        node.argumentExpression &&
        ts.isStringLiteralLike(node.argumentExpression) &&
        node.argumentExpression.text === rootName)
    ) {
      found = true
    }
    ts.forEachChild(node, visit)
  }
  visit(expression)
  return found
}

export function resolveAlias(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
}

/** Only these callbacks are invoked by the route helper that receives them. */
function findRouteCall(expression: ts.Expression): ts.CallExpression | undefined {
  if (ts.isCallExpression(expression)) {
    if (
      ts.isPropertyAccessExpression(expression.expression) &&
      expression.expression.name.text === 'route'
    ) {
      return expression
    }
    return findRouteCall(expression.expression)
  }
  if (ts.isPropertyAccessExpression(expression)) return findRouteCall(expression.expression)
  return undefined
}

function keyOf(route: Pick<Route, 'method' | 'routeTemplate'>): string {
  return `${route.method}:${route.routeTemplate}`
}
