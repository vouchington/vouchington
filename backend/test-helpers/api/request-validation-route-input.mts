import ts from 'typescript'

import { isExecutedAdmissionCallback } from './request-validation-route-execution.mts'
import { contextRoot, isQueryRoot } from './request-validation-route-input-roots.mts'
import { recordQueryReadSite } from './request-validation-route-read-sites.mts'
import {
  findRegistration,
  resolveHandlerNodes,
  resolvedName,
} from './request-validation-route-ast.mts'

import type { Route } from './request-validation-route-catalog.mts'

export function discoverSourceInputOperationsForProgram(
  program: ts.Program,
  routeFiles: readonly ts.SourceFile[],
  routes: readonly Route[],
  queryReads?: Map<string, Set<string>>,
  queryReadSites?: Map<string, ts.Node[]>,
): Set<string> {
  const checker = program.getTypeChecker()
  const operations = new Set<string>()
  for (const route of routes) {
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
      const querySymbols = new Set<ts.Symbol>()
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
        queryReads,
        queryReadSites,
        querySymbols,
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
  queryReads?: Map<string, Set<string>>
  queryReadSites?: Map<string, ts.Node[]>
  querySymbols: Set<ts.Symbol>
}

function inspectRouteNode(
  node: ts.Node,
  contexts: Set<ts.Symbol>,
  root: boolean,
  visitedCalls: Set<ts.Symbol>,
  inspection: Inspection,
): void {
  const { checker, operation, operations, routeFiles, querySymbols } = inspection
  if (!root && ts.isFunctionLike(node) && !isExecutedAdmissionCallback(node, checker)) return
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    const initializer = contextRoot(node.initializer, checker, contexts)
    const symbol = checker.getSymbolAtLocation(node.name)
    if (initializer && symbol) contexts.add(symbol)
    if (symbol && isQueryRoot(node.initializer, checker, contexts, querySymbols)) {
      querySymbols.add(symbol)
    }
  }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isObjectBindingPattern(node.name) &&
    node.initializer &&
    isQueryRoot(node.initializer, checker, contexts, querySymbols)
  ) {
    operations.add(operation)
    for (const element of node.name.elements) {
      if (!element.dotDotDotToken) {
        const property = element.propertyName ?? element.name
        const key =
          ts.isIdentifier(property) || ts.isStringLiteralLike(property) ? property.text : '*'
        const reads = inspection.queryReads?.get(operation) ?? new Set<string>()
        reads.add(key)
        inspection.queryReads?.set(operation, reads)
        recordQueryReadSite(element, checker, operation, inspection.queryReadSites)
      }
      if (ts.isIdentifier(element.name)) {
        const symbol = checker.getSymbolAtLocation(element.name)
        if (symbol) querySymbols.add(symbol)
      }
    }
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
    if (isQueryRoot(node.expression, checker, contexts, querySymbols)) {
      const reads = inspection.queryReads?.get(operation) ?? new Set<string>()
      reads.add(node.name.text)
      inspection.queryReads?.set(operation, reads)
      recordQueryReadSite(node, checker, operation, inspection.queryReadSites)
    }
  }
  if (ts.isElementAccessExpression(node) && contextRoot(node.expression, checker, contexts)) {
    operations.add(operation)
    if (isQueryRoot(node.expression, checker, contexts, querySymbols)) {
      const key =
        node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression)
          ? node.argumentExpression.text
          : '*'
      const reads = inspection.queryReads?.get(operation) ?? new Set<string>()
      reads.add(key)
      inspection.queryReads?.set(operation, reads)
      recordQueryReadSite(node, checker, operation, inspection.queryReadSites)
    }
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
            if (
              argument &&
              parameterSymbol &&
              isQueryRoot(argument, checker, contexts, querySymbols)
            ) {
              inspection.querySymbols.add(parameterSymbol)
            }
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
