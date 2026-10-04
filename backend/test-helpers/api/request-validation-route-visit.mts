import ts from 'typescript'

import type { CarrierBindings } from './request-validation-route-carrier-origin.mts'

export function alreadyVisited(
  node: ts.Node,
  bindings: ReadonlyMap<ts.Symbol, string>,
  carriers: CarrierBindings,
  conditionalCall: boolean,
  checker: ts.TypeChecker,
  visited: Map<ts.Node, Set<string>>,
): boolean {
  const bindingKey = [...bindings]
    .map(([symbol, value]) => `${checker.getFullyQualifiedName(symbol)}=${value}`)
    .toSorted()
    .join('|')
  const carrierKey = [...carriers]
    .map(
      ([symbol, value]) =>
        `${checker.getFullyQualifiedName(symbol)}=${[...value].toSorted().join(',')}`,
    )
    .toSorted()
    .join('|')
  const key = `${bindingKey}#${carrierKey}#${conditionalCall}`
  const seen = visited.get(node) ?? new Set<string>()
  if (seen.has(key)) return true
  seen.add(key)
  visited.set(node, seen)
  return false
}

export function handlerCarrierBindings(handler: ts.Node, checker: ts.TypeChecker): CarrierBindings {
  const bindings: CarrierBindings = new Map()
  if (ts.isFunctionLike(handler)) {
    const context = handler.parameters[0]?.name
    if (context && ts.isIdentifier(context)) {
      const symbol = checker.getSymbolAtLocation(context)
      if (symbol) bindings.set(symbol, new Set(['context']))
    }
  }
  return bindings
}
