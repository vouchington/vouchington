import ts from 'typescript'

import { repoRelativePath } from './program-paths.mts'
import { discoveryCallLabel } from './response-contract-discovery-call.mts'

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

type RouteBinding = { method: string; routeTemplate: string }
type BindingSets = {
  unambiguous: Set<ts.Symbol>
  ambiguous: Map<ts.Symbol, readonly string[]>
}

/**
 * Fails discovery when a response emission sits in a function registered on more than one
 * distinct route. The one-route-per-helper limit stays: those calls are still not attributed
 * to an arbitrary winner, but omitting them is now a hard error.
 */
export function assertUniqueResponseAttribution(
  program: ts.Program,
  sourceFiles: readonly ts.SourceFile[],
): void {
  const checker = program.getTypeChecker()
  const bindings = collectRouteBindings(sourceFiles, checker)
  const failures: string[] = []
  for (const sourceFile of sourceFiles) {
    visit(sourceFile, node => {
      if (!ts.isCallExpression(node)) return
      const label = discoveryCallLabel(node)
      if (!label) return
      const routes = ambiguousRoutesForCall(node, checker, bindings)
      if (!routes) return
      failures.push(formatFailure(sourceFile, node, label, routes))
    })
  }
  if (failures.length === 0) return
  throw new Error(failures.toSorted().join('\n'))
}

function collectRouteBindings(
  sourceFiles: readonly ts.SourceFile[],
  checker: ts.TypeChecker,
): BindingSets {
  const bindingsBySymbol = new Map<ts.Symbol, RouteBinding[]>()
  for (const sourceFile of sourceFiles) {
    visit(sourceFile, node => {
      if (!ts.isCallExpression(node)) return
      const method = propertyName(node.expression)?.toUpperCase()
      if (!method || !HTTP_METHODS.has(method)) return
      const routeTemplate = routeTemplateFromExpression(node.expression)
      if (!routeTemplate) return
      const binding = { method, routeTemplate }
      for (const symbol of handlerArgumentSymbols(node, checker)) {
        const resolved = resolveSymbol(symbol, checker)
        const candidates = bindingsBySymbol.get(resolved) ?? []
        candidates.push(binding)
        bindingsBySymbol.set(resolved, candidates)
      }
    })
  }
  const unambiguous = new Set<ts.Symbol>()
  const ambiguous = new Map<ts.Symbol, readonly string[]>()
  for (const [symbol, candidates] of bindingsBySymbol) {
    const [first] = candidates
    if (!first) continue
    const sameRoute = candidates.every(
      candidate =>
        candidate.method === first.method && candidate.routeTemplate === first.routeTemplate,
    )
    if (sameRoute) {
      unambiguous.add(symbol)
      continue
    }
    const routes = [
      ...new Set(candidates.map(candidate => `${candidate.method}:${candidate.routeTemplate}`)),
    ].toSorted()
    ambiguous.set(symbol, routes)
  }
  return { unambiguous, ambiguous }
}

function ambiguousRoutesForCall(
  node: ts.Node,
  checker: ts.TypeChecker,
  bindings: BindingSets,
): readonly string[] | undefined {
  let current: ts.Node | undefined = node
  while (current) {
    if (lexicalRoute(current)) return undefined
    const symbol = functionSymbol(current, checker)
    if (symbol) {
      const resolved = resolveSymbol(symbol, checker)
      if (bindings.unambiguous.has(resolved)) return undefined
      const routes = bindings.ambiguous.get(resolved)
      if (routes) return routes
    }
    current = current.parent
  }
  return undefined
}

function formatFailure(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  label: string,
  routes: readonly string[],
): string {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  const location = `${repoRelativePath(sourceFile.fileName)}:${position.line + 1}:${position.character + 1}`
  return `${location}: ${label} cannot be attributed to one route (${routes.join(', ')}). Keep the call at each route's own call site.`
}

function handlerArgumentSymbols(node: ts.CallExpression, checker: ts.TypeChecker): ts.Symbol[] {
  const symbols: ts.Symbol[] = []
  for (const argument of node.arguments) {
    if (ts.isIdentifier(argument)) {
      const symbol = checker.getSymbolAtLocation(argument)
      if (symbol) symbols.push(symbol)
      continue
    }
    if (!isRouteFunction(argument)) continue
    visit(argument, child => {
      if (!ts.isCallExpression(child) || !ts.isIdentifier(child.expression)) return
      const symbol = checker.getSymbolAtLocation(child.expression)
      if (symbol) symbols.push(symbol)
    })
  }
  return symbols
}

function lexicalRoute(node: ts.Node): boolean {
  if (!isRouteFunction(node) || !ts.isCallExpression(node.parent)) return false
  const method = propertyName(node.parent.expression)?.toUpperCase()
  if (!method || !HTTP_METHODS.has(method)) return false
  return routeTemplateFromExpression(node.parent.expression) !== undefined
}

function functionSymbol(node: ts.Node, checker: ts.TypeChecker): ts.Symbol | undefined {
  if (ts.isFunctionDeclaration(node) && node.name) return checker.getSymbolAtLocation(node.name)
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return checker.getSymbolAtLocation(node.parent.name)
  }
  return undefined
}

function resolveSymbol(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
}

function routeTemplateFromExpression(expression: ts.Expression): string | undefined {
  if (!ts.isPropertyAccessExpression(expression)) return undefined
  return findRouteCall(expression.expression)
}

function findRouteCall(expression: ts.Expression): string | undefined {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) {
    return undefined
  }
  if (expression.expression.name.text === 'route') {
    const route = expression.arguments[0]
    return route && ts.isStringLiteral(route) ? route.text : undefined
  }
  return findRouteCall(expression.expression.expression)
}

function propertyName(expression: ts.Expression): string | undefined {
  return ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined
}

function isRouteFunction(node: ts.Node): boolean {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node)
}

function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node)
  node.forEachChild(child => visit(child, callback))
}
