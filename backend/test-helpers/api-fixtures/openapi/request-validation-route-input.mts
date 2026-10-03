import ts from 'typescript'

import { loadRegisteredRouteCatalog } from '../backend-contract-catalog.mts'
import { loadBackendProgram } from '../backend-program.mts'
import {
  findRegistration,
  resolveAlias,
  resolveHandlerNodes,
  resolvedName,
} from './request-validation-route-ast.mts'

/** Finds request input consumed by the registered handler, excluding sibling routes in a module. */
export function discoverSourceInputOperations(): Set<string> {
  const { program, routeFiles } = loadBackendProgram()
  const checker = program.getTypeChecker()
  const operations = new Set<string>()
  for (const route of loadRegisteredRouteCatalog()) {
    if (!route.routeTemplate.startsWith('/api/v1/')) continue
    const [fileName, lineText] = route.source.split(':')
    const source = fileName
      ? routeFiles.find(candidate =>
          candidate.fileName.replaceAll('\\', '/').endsWith(`/${fileName}`),
        )
      : undefined
    const line = Number(lineText)
    if (!source || !Number.isInteger(line))
      throw new Error(`Cannot resolve route source ${route.source}`)
    const registration = findRegistration(source, route, line)
    const handlers = registration.arguments.flatMap(argument =>
      resolveHandlerNodes(argument, checker),
    )
    const operation = `${route.method}:${route.routeTemplate}`
    if (route.routeTemplate.includes(':')) operations.add(operation)
    for (const handler of handlers) {
      const contextSymbols = new Set<ts.Symbol>()
      if (ts.isFunctionLike(handler)) {
        const contextParameter = handler.parameters[0]?.name
        if (contextParameter && ts.isIdentifier(contextParameter)) {
          const symbol = checker.getSymbolAtLocation(contextParameter)
          if (symbol) contextSymbols.add(symbol)
        }
      }
      inspectRouteNode(handler, contextSymbols, true, new Set(), {
        checker,
        operation,
        operations,
        routeFiles,
      })
    }
  }
  return operations
}

type Inspection = {
  checker: ts.TypeChecker
  operation: string
  operations: Set<string>
  routeFiles: readonly ts.SourceFile[]
}

function inspectRouteNode(
  node: ts.Node,
  contexts: Set<ts.Symbol>,
  root: boolean,
  visitedCalls: Set<ts.Symbol>,
  inspection: Inspection,
): void {
  const { checker, operation, operations, routeFiles } = inspection
  if (!root && ts.isFunctionLike(node) && !isExecutedAdmissionCallback(node, checker)) return
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    const initializer = contextRoot(node.initializer, checker, contexts)
    const symbol = checker.getSymbolAtLocation(node.name)
    if (initializer && symbol) contexts.add(symbol)
  }
  if (ts.isPropertyAccessExpression(node)) {
    const directContext = contextRoot(node.expression, checker, contexts)
    const requestObject =
      ts.isPropertyAccessExpression(node.expression) &&
      contextRoot(node.expression.expression, checker, contexts) &&
      ['req', 'request'].includes(node.expression.name.text)
    const inputProperty =
      (directContext && ['query', 'url'].includes(node.name.text)) ||
      (requestObject &&
        [
          'url',
          'headers',
          'body',
          'rawBody',
          'json',
          'text',
          'formData',
          'arrayBuffer',
          'blob',
        ].includes(node.name.text))
    if (inputProperty) operations.add(operation)
  }
  if (ts.isCallExpression(node)) {
    const name = resolvedName(node.expression, checker)
    if (name && /(?:parse|read).*Body/i.test(name)) operations.add(operation)
    if (ts.isIdentifier(node.expression)) {
      const symbol = checker.getSymbolAtLocation(node.expression)
      const target =
        symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol)
      if (target && !visitedCalls.has(target)) {
        for (const declaration of target.declarations ?? []) {
          if (!routeFiles.includes(declaration.getSourceFile())) continue
          const implementation = ts.isVariableDeclaration(declaration)
            ? declaration.initializer
            : ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)
              ? declaration
              : undefined
          if (!implementation || !ts.isFunctionLike(implementation)) continue
          const nested = new Set(contexts)
          implementation.parameters.forEach((parameter, index) => {
            const name = ts.isIdentifier(parameter.name) ? parameter.name : undefined
            const argument = node.arguments[index]
            const rootSymbol = argument && contextRoot(argument, checker, contexts)
            const parameterSymbol = name && checker.getSymbolAtLocation(name)
            if (rootSymbol && parameterSymbol) nested.add(parameterSymbol)
          })
          const calls = new Set(visitedCalls).add(target)
          if (implementation.body)
            inspectRouteNode(implementation.body, nested, true, calls, inspection)
        }
      }
    }
  }
  ts.forEachChild(node, child => inspectRouteNode(child, contexts, false, visitedCalls, inspection))
}

function contextRoot(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  contexts: Set<ts.Symbol>,
): boolean {
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

/** Only these callbacks are invoked by the route helper that receives them. */
export function isExecutedAdmissionCallback(node: ts.Node, checker: ts.TypeChecker): boolean {
  if (
    !ts.isFunctionDeclaration(node) &&
    !ts.isMethodDeclaration(node) &&
    !ts.isArrowFunction(node) &&
    !ts.isFunctionExpression(node)
  )
    return false
  const property = node.parent
  const name =
    ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)
      ? property.name.text
      : undefined
  if (
    !ts.isPropertyAssignment(property) ||
    !['beforeCapacity', 'beforeCommit', 'execute'].includes(name ?? '')
  ) {
    return false
  }
  const object = property.parent
  const call = object.parent
  if (
    !ts.isObjectLiteralExpression(object) ||
    !ts.isCallExpression(call) ||
    !call.arguments.includes(object)
  ) {
    return false
  }
  const symbol = ts.isIdentifier(call.expression)
    ? checker.getSymbolAtLocation(call.expression)
    : undefined
  const target = symbol && resolveAlias(symbol, checker)
  return !!target?.declarations?.some(declaration =>
    declaration
      .getSourceFile()
      .fileName.replaceAll('\\', '/')
      .endsWith('/backend/services/contribution-gating/admit-route-contribution.mts'),
  )
}
