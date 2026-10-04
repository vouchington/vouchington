import ts from 'typescript'

import { priorCarrierWrites } from './request-validation-route-carrier-writes.mts'

export type CarrierBindings = Map<ts.Symbol, ReadonlySet<string>>

export function requestCarrierOrigins(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  bindings: CarrierBindings,
  visited = new Set<ts.Symbol>(),
): Set<string> {
  const origins = new Set<string>()

  const trace = (node: ts.Node, seen: Set<ts.Symbol>): Set<string> => {
    const found = new Set<string>()
    if (ts.isParenthesizedExpression(node)) return trace(node.expression, seen)
    if (ts.isIdentifier(node)) {
      const symbol = identifierSymbol(node, checker)
      if (symbol) {
        const direct = bindings.get(symbol)
        if (direct) return new Set(direct)
        if (!seen.has(symbol)) {
          const nextSeen = new Set(seen).add(symbol)
          for (const declaration of symbol.declarations ?? []) {
            if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
              for (const origin of trace(declaration.initializer, nextSeen)) found.add(origin)
            } else if (
              ts.isBindingElement(declaration) &&
              ts.isVariableDeclaration(declaration.parent.parent) &&
              declaration.parent.parent.initializer
            ) {
              for (const origin of trace(declaration.parent.parent.initializer, nextSeen))
                found.add(origin)
            }
          }
          for (const write of priorCarrierWrites(node, symbol, checker)) {
            for (const origin of trace(write, nextSeen)) found.add(origin)
          }
        }
      }
      return found
    }
    if (ts.isCallExpression(node)) {
      if (
        isBodyReader(node, checker, bindings, seen) ||
        (isTrustedBodyParser(node, checker) &&
          node.arguments.some(argument => trace(argument, seen).has('context')))
      ) {
        found.add('body')
      }
      for (const implementation of localApiHelpers(node, checker)) {
        const helperBindings = new Map(bindings)
        implementation.parameters.forEach((parameter, index) => {
          if (!ts.isIdentifier(parameter.name) || !node.arguments[index]) return
          const symbol = checker.getSymbolAtLocation(parameter.name)
          const parameterOrigins = trace(node.arguments[index], seen)
          if (symbol && parameterOrigins.size > 0) helperBindings.set(symbol, parameterOrigins)
        })
        if (implementation.body) {
          for (const origin of requestCarrierOrigins(
            implementation.body as ts.Expression,
            checker,
            helperBindings,
            new Set(seen),
          )) {
            found.add(origin)
          }
        }
      }
    }
    if (ts.isPropertyAccessExpression(node)) {
      const root = trace(node.expression, seen)
      if (root.has('context') && ['query', 'params'].includes(node.name.text)) {
        found.add(node.name.text === 'params' ? 'path' : 'query')
      }
      if (
        node.name.text === 'headers' &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'req' &&
        trace(node.expression.expression, seen).has('context')
      )
        found.add('header')
    }
    if (ts.isElementAccessExpression(node) && node.argumentExpression) {
      const root = trace(node.expression, seen)
      const key = ts.isStringLiteralLike(node.argumentExpression)
        ? node.argumentExpression.text
        : undefined
      if (root.has('context') && key && ['query', 'params'].includes(key)) {
        found.add(key === 'params' ? 'path' : 'query')
      }
    }
    ts.forEachChild(node, child => {
      for (const origin of trace(child, seen)) found.add(origin)
    })
    return found
  }

  for (const origin of trace(expression, visited)) origins.add(origin)
  return origins
}

function identifierSymbol(node: ts.Identifier, checker: ts.TypeChecker): ts.Symbol | undefined {
  return ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
    ? (checker.getShorthandAssignmentValueSymbol(node.parent) ?? checker.getSymbolAtLocation(node))
    : checker.getSymbolAtLocation(node)
}

function localApiHelpers(
  node: ts.CallExpression,
  checker: ts.TypeChecker,
): ts.FunctionLikeDeclaration[] {
  if (!ts.isIdentifier(node.expression)) return []
  const symbol = checker.getSymbolAtLocation(node.expression)
  const target =
    symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol)
  return (target?.declarations ?? []).flatMap(declaration => {
    const implementation = ts.isFunctionDeclaration(declaration)
      ? declaration
      : ts.isVariableDeclaration(declaration) &&
          declaration.initializer &&
          ts.isFunctionLike(declaration.initializer)
        ? declaration.initializer
        : undefined
    return implementation?.body &&
      implementation.getSourceFile().fileName.replaceAll('\\', '/').includes('/backend/api/')
      ? [implementation]
      : []
  })
}

function isTrustedBodyParser(node: ts.CallExpression, checker: ts.TypeChecker): boolean {
  if (!ts.isIdentifier(node.expression) || node.expression.text !== 'parseJsonBody') return false
  const symbol = checker.getSymbolAtLocation(node.expression)
  const target =
    symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol)
  return !!target?.declarations?.some(declaration =>
    declaration
      .getSourceFile()
      .fileName.replaceAll('\\', '/')
      .endsWith('/backend/api/response-helpers.mts'),
  )
}

function isBodyReader(
  node: ts.CallExpression,
  checker: ts.TypeChecker,
  bindings: CarrierBindings,
  visited: Set<ts.Symbol>,
): boolean {
  return (
    ts.isPropertyAccessExpression(node.expression) &&
    ['json', 'text', 'formData', 'arrayBuffer', 'blob', 'buffer'].includes(
      node.expression.name.text,
    ) &&
    ts.isPropertyAccessExpression(node.expression.expression) &&
    node.expression.expression.name.text === 'request' &&
    traceContext(node.expression.expression.expression, checker, bindings, visited)
  )
}

function traceContext(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  bindings: CarrierBindings,
  visited: Set<ts.Symbol>,
): boolean {
  if (ts.isParenthesizedExpression(expression))
    return traceContext(expression.expression, checker, bindings, visited)
  if (!ts.isIdentifier(expression)) return false
  const symbol = identifierSymbol(expression, checker)
  const direct = symbol && bindings.get(symbol)
  if (direct?.has('context')) return true
  if (!symbol || visited.has(symbol)) return false
  const next = new Set(visited).add(symbol)
  return (symbol.declarations ?? []).some(
    declaration =>
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer &&
      traceContext(declaration.initializer, checker, bindings, next),
  )
}
