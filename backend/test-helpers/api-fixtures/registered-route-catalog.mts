import ts from 'typescript'

import { loadBackendProgram, type BackendProgramGeneration } from './backend-program.mts'
import {
  propertyName,
  routeTemplateFromExpression,
  visit,
} from './response-contract-route-analysis.mts'

export type RegisteredRoute = {
  method: string
  routeTemplate: string
  kind: 'ordinary' | 'sse' | 'error-only' | 'fixed-no-content'
  fixedStatus?: number
  source: string
}

let cachedCatalog: { generation: BackendProgramGeneration; routes: RegisteredRoute[] } | undefined
export const routeShape = (routeTemplate: string): string => routeTemplate.replace(/:[^/]+/g, ':')
export const resetRegisteredRouteCatalogCacheForTest = () => (cachedCatalog = undefined)

export function loadRegisteredRouteCatalog(): RegisteredRoute[] {
  const { generation, program, routeFiles } = loadBackendProgram()
  if (cachedCatalog?.generation === generation) return cachedCatalog.routes
  const routes = discoverRegisteredRoutes(program, routeFiles)
  cachedCatalog = { generation, routes }
  return routes
}

export function discoverRegisteredRoutes(
  program: ts.Program,
  sourceFiles: readonly ts.SourceFile[],
): RegisteredRoute[] {
  const checker = program.getTypeChecker()
  const routes: RegisteredRoute[] = []
  const registrations = new Map<string, RegisteredRoute>()
  sourceFiles.forEach(sourceFile => {
    visit(sourceFile, node => {
      if (!ts.isCallExpression(node)) return
      const method = propertyName(node.expression)?.toUpperCase()
      if (!method || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return
      const routeTemplate = routeTemplateFromExpression(node.expression)
      if (!routeTemplate) return
      const key = `${method}:${routeShape(routeTemplate)}`
      const source = `${sourceFile.fileName}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
      const classification = classifyHandler(node, checker, method, routeTemplate)
      const route = {
        method,
        routeTemplate,
        ...classification,
        source,
      } satisfies RegisteredRoute
      const existing = registrations.get(key)
      if (existing)
        throw new Error(`Duplicate registered API route ${key} at ${existing.source} and ${source}`)
      registrations.set(key, route)
      routes.push(route)
    })
  })
  return routes.toSorted((left, right) =>
    `${left.method}:${left.routeTemplate}`.localeCompare(`${right.method}:${right.routeTemplate}`),
  )
}

function classifyHandler(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
  method: string,
  routeTemplate: string,
): Pick<RegisteredRoute, 'kind' | 'fixedStatus'> {
  const nodes = call.arguments.flatMap(argument => handlerNodes(argument, checker))
  if (nodes.length === 0)
    throw new Error(`Cannot inspect registered route handler ${method}:${routeTemplate}`)
  let sse = false
  let error405 = false
  let fixedStatus: number | undefined
  nodes.forEach(node => {
    visit(node, child => {
      if (!ts.isCallExpression(child)) return
      if (ts.isIdentifier(child.expression) && child.expression.text === 'apiOpenApiNoContent') {
        const [key, status] = child.arguments
        if (!key || !ts.isStringLiteral(key) || key.text !== `${method}:${routeTemplate}`)
          throw new Error(
            `apiOpenApiNoContent key must match registered route ${method}:${routeTemplate}`,
          )
        if (!status || !ts.isNumericLiteral(status))
          throw new Error('apiOpenApiNoContent status requires a numeric literal')
        const value = Number(status.text)
        if (fixedStatus !== undefined && fixedStatus !== value)
          throw new Error(`Conflicting apiOpenApiNoContent statuses for ${method}:${routeTemplate}`)
        fixedStatus = value
      }
      if (ts.isIdentifier(child.expression) && child.expression.text === 'startSSE') sse = true
      if (
        ts.isPropertyAccessExpression(child.expression) &&
        child.expression.name.text === 'setType' &&
        child.arguments[0] &&
        ts.isStringLiteral(child.arguments[0]) &&
        child.arguments[0].text.toLowerCase() === 'text/event-stream'
      )
        sse = true
      if (
        ts.isPropertyAccessExpression(child.expression) &&
        child.expression.name.text === 'throw' &&
        child.arguments[0] &&
        ts.isNumericLiteral(child.arguments[0]) &&
        child.arguments[0].text === '405'
      )
        error405 = true
    })
  })
  if (fixedStatus !== undefined) {
    if (sse)
      throw new Error(
        `apiOpenApiNoContent conflicts with SSE response handling for ${method}:${routeTemplate}`,
      )
    return { kind: 'fixed-no-content', fixedStatus }
  }
  return { kind: sse ? 'sse' : error405 ? 'error-only' : 'ordinary' }
}

function handlerNodes(
  argument: ts.Expression,
  checker: ts.TypeChecker,
  parameterBindings = new Map<ts.Symbol, ts.Expression>(),
): ts.Node[] {
  if (ts.isIdentifier(argument)) {
    const symbol = checker.getSymbolAtLocation(argument)
    const boundArgument = symbol && parameterBindings.get(symbol)
    if (boundArgument) return handlerNodes(boundArgument, checker, parameterBindings)
  }
  if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) return [argument]
  if (ts.isCallExpression(argument)) {
    return callableImplementations(argument.expression, checker).flatMap(implementation => {
      const bindings = new Map(parameterBindings)
      implementation.parameters.forEach((parameter, index) => {
        const callArgument = argument.arguments[index]
        const symbol = checker.getSymbolAtLocation(parameter.name)
        if (callArgument && symbol) bindings.set(symbol, callArgument)
      })
      return returnedExpressions(implementation).flatMap(returnedExpression =>
        handlerNodes(returnedExpression, checker, bindings),
      )
    })
  }
  return declarationImplementations(argument, checker)
}

function callableImplementations(
  node: ts.Node,
  checker: ts.TypeChecker,
): ts.FunctionLikeDeclaration[] {
  const symbol = checker.getSymbolAtLocation(node)
  if (!symbol) return []
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
  const implementations: ts.FunctionLikeDeclaration[] = []
  for (const declaration of resolved.declarations ?? []) {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      const initializer = declaration.initializer
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
        implementations.push(initializer)
      continue
    }
    if (
      (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) &&
      declaration.body
    )
      implementations.push(declaration)
  }
  return implementations
}

function returnedExpressions(declaration: ts.FunctionLikeDeclaration): ts.Expression[] {
  if (!declaration.body) return []
  if (!ts.isBlock(declaration.body)) return [declaration.body]
  const returned: ts.Expression[] = []
  const collect = (node: ts.Node): void => {
    if (node !== declaration && ts.isFunctionLike(node)) return
    if (ts.isReturnStatement(node)) {
      if (node.expression) returned.push(node.expression)
      return
    }
    node.forEachChild(collect)
  }
  declaration.body.forEachChild(collect)
  return returned
}

function declarationImplementations(node: ts.Node, checker: ts.TypeChecker): ts.Node[] {
  const symbol = checker.getSymbolAtLocation(node)
  if (!symbol) return []
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
  return (resolved.declarations ?? []).flatMap(declaration => {
    if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration))
      return declaration.body ? [declaration] : []
    if (ts.isVariableDeclaration(declaration) && declaration.initializer)
      return [declaration, ...handlerNodes(declaration.initializer, checker)]
    return []
  })
}
