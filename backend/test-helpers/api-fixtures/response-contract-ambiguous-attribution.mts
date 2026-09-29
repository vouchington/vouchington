import type {
  CallExpression,
  Expression,
  Node,
  Program,
  SourceFile,
  Symbol,
  TypeChecker,
} from 'typescript'

import { discoveryCallLabel } from './response-contract-discovery-call.mts'
import {
  isTypescriptArrowFunction,
  isTypescriptCallExpression,
  isTypescriptFunctionDeclaration,
  isTypescriptFunctionExpression,
  isTypescriptIdentifier,
  isTypescriptPropertyAccessExpression,
  isTypescriptStringLiteral,
  isTypescriptVariableDeclaration,
  repoRelativePath,
  typescriptSymbolFlags,
} from './program-paths.mts'

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

type RouteBinding = { method: string; routeTemplate: string }
type BindingSets = {
  unambiguous: Set<Symbol>
  ambiguous: Map<Symbol, readonly string[]>
}

/** A response helper registered on more than one distinct route is a hard discovery error. */
export function assertUniqueResponseAttribution(
  program: Program,
  sourceFiles: readonly SourceFile[],
): void {
  const checker = program.getTypeChecker()
  const bindings = collectRouteBindings(sourceFiles, checker)
  const failures: string[] = []
  for (const sourceFile of sourceFiles) {
    visit(sourceFile, node => {
      if (!isTypescriptCallExpression(node)) return
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
  sourceFiles: readonly SourceFile[],
  checker: TypeChecker,
): BindingSets {
  const bindingsBySymbol = new Map<Symbol, RouteBinding[]>()
  for (const sourceFile of sourceFiles) {
    visit(sourceFile, node => {
      if (!isTypescriptCallExpression(node)) return
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
  const unambiguous = new Set<Symbol>()
  const ambiguous = new Map<Symbol, readonly string[]>()
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
  node: Node,
  checker: TypeChecker,
  bindings: BindingSets,
): readonly string[] | undefined {
  let current: Node | undefined = node
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
  sourceFile: SourceFile,
  node: CallExpression,
  label: string,
  routes: readonly string[],
): string {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  const location = `${repoRelativePath(sourceFile.fileName)}:${position.line + 1}:${position.character + 1}`
  return `${location}: ${label} cannot be attributed to one route (${routes.join(', ')}). Keep the call at each route's own call site.`
}

function handlerArgumentSymbols(node: CallExpression, checker: TypeChecker): Symbol[] {
  const symbols: Symbol[] = []
  for (const argument of node.arguments) {
    if (isTypescriptIdentifier(argument)) {
      const symbol = checker.getSymbolAtLocation(argument)
      if (symbol) symbols.push(symbol)
      continue
    }
    if (!isRouteFunction(argument)) continue
    visit(argument, child => {
      if (!isTypescriptCallExpression(child) || !isTypescriptIdentifier(child.expression)) return
      const symbol = checker.getSymbolAtLocation(child.expression)
      if (symbol) symbols.push(symbol)
    })
  }
  return symbols
}

function lexicalRoute(node: Node): boolean {
  if (!isRouteFunction(node) || !isTypescriptCallExpression(node.parent)) return false
  const method = propertyName(node.parent.expression)?.toUpperCase()
  if (!method || !HTTP_METHODS.has(method)) return false
  return routeTemplateFromExpression(node.parent.expression) !== undefined
}

function functionSymbol(node: Node, checker: TypeChecker): Symbol | undefined {
  if (isTypescriptFunctionDeclaration(node) && node.name)
    return checker.getSymbolAtLocation(node.name)
  if (
    (isTypescriptArrowFunction(node) || isTypescriptFunctionExpression(node)) &&
    isTypescriptVariableDeclaration(node.parent) &&
    isTypescriptIdentifier(node.parent.name)
  ) {
    return checker.getSymbolAtLocation(node.parent.name)
  }
  return undefined
}

function resolveSymbol(symbol: Symbol, checker: TypeChecker): Symbol {
  return symbol.flags & typescriptSymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
}

function routeTemplateFromExpression(expression: Expression): string | undefined {
  if (!isTypescriptPropertyAccessExpression(expression)) return undefined
  return findRouteCall(expression.expression)
}

function findRouteCall(expression: Expression): string | undefined {
  if (
    !isTypescriptCallExpression(expression) ||
    !isTypescriptPropertyAccessExpression(expression.expression)
  ) {
    return undefined
  }
  if (expression.expression.name.text === 'route') {
    const route = expression.arguments[0]
    return route && isTypescriptStringLiteral(route) ? route.text : undefined
  }
  return findRouteCall(expression.expression.expression)
}

function propertyName(expression: Expression): string | undefined {
  return isTypescriptPropertyAccessExpression(expression) ? expression.name.text : undefined
}

function isRouteFunction(node: Node): boolean {
  return isTypescriptArrowFunction(node) || isTypescriptFunctionExpression(node)
}

function visit(node: Node, callback: (node: Node) => void): void {
  callback(node)
  node.forEachChild(child => visit(child, callback))
}
