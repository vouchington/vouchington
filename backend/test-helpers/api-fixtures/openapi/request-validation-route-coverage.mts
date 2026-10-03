import ts from 'typescript'

import { loadRegisteredRouteCatalog } from '../backend-contract-catalog.mts'
import { loadBackendProgram } from '../backend-program.mts'
import {
  findRegistration,
  propertyString,
  resolveAlias,
  resolveHandlerNodes,
  resolveString,
  resolvedName,
  resolveExpression,
} from './request-validation-route-ast.mts'
import { isExecutedAdmissionCallback } from './request-validation-route-input.mts'

type Route = ReturnType<typeof loadRegisteredRouteCatalog>[number]

const VALIDATORS = new Set([
  'validateRequestContract',
  'parseAndValidatePaginatedRequest',
  'parseAndValidateCaseListQuery',
])

/**
 * Finds runtime validation calls from each registered handler, following its local handler
 * functions and imported factories. The route source location scopes discovery; a marker elsewhere
 * in the same file cannot classify this operation.
 */
export function discoverRuntimeValidatedOperations(): Set<string> {
  const { program, routeFiles } = loadBackendProgram()
  const checker = program.getTypeChecker()
  const validated = new Set<string>()

  for (const route of loadRegisteredRouteCatalog()) {
    if (!isThirdPartyRoute(route)) continue
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
    const handlerNodes = registration.arguments.flatMap(argument =>
      resolveHandlerNodes(argument, checker),
    )
    if (handlerNodes.length === 0)
      throw new Error(`Cannot inspect route handler ${routeKey(route)}`)

    const operation = routeKey(route)
    const visited = new Map<ts.Node, Set<string>>()
    const inspect = (node: ts.Node, bindings = new Map<ts.Symbol, string>()): void => {
      const bindingKey = [...bindings]
        .map(([symbol, value]) => `${checker.getFullyQualifiedName(symbol)}=${value}`)
        .toSorted()
        .join('|')
      const nodeBindings = visited.get(node) ?? new Set<string>()
      if (nodeBindings.has(bindingKey)) return
      nodeBindings.add(bindingKey)
      visited.set(node, nodeBindings)
      // A route only owns code that runs in its handler or in a helper that it actually invokes.
      // A nested callback/declaration is not evidence merely because its body mentions a validator.
      if (
        ts.isFunctionLike(node) &&
        !handlerNodes.includes(node) &&
        !isExecutedAdmissionCallback(node, checker)
      )
        return
      if (ts.isCallExpression(node)) {
        const name = resolvedName(node.expression, checker)
        if (name && VALIDATORS.has(name)) {
          assertTrustedValidator(node.expression, name, checker, operation)
          const key = resolveString(node.arguments[1], checker, bindings)
          if (!key) throw new Error(`${name} in ${operation} has a non-static operation key`)
          if (key !== operation) throw new Error(`${name} in ${operation} validates ${key}`)
          validated.add(operation)
          return
        }
        if (name === 'createVoteHandler' || name === 'createVoteClearHandler') {
          assertTrustedVoteFactory(node.expression, checker, operation)
          const options = node.arguments[0]
          const optionValue = options && resolveExpression(options, checker)
          const key =
            optionValue &&
            propertyString(optionValue, 'requestContractOperation', checker, bindings)
          if (!key) throw new Error(`${name} in ${operation} has no requestContractOperation`)
          if (key !== operation) throw new Error(`${name} in ${operation} validates ${key}`)
          validated.add(operation)
          return
        }
        if (ts.isIdentifier(node.expression)) {
          const symbol = checker.getSymbolAtLocation(node.expression)
          const target = symbol && resolveAlias(symbol, checker)
          for (const declaration of target?.declarations ?? []) {
            if (
              routeFiles.includes(declaration.getSourceFile()) &&
              ts.isVariableDeclaration(declaration) &&
              declaration.initializer
            ) {
              inspect(declaration.initializer, bindings)
            } else if (
              routeFiles.includes(declaration.getSourceFile()) &&
              (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) &&
              declaration.body
            ) {
              const nestedBindings = new Map(bindings)
              declaration.parameters.forEach((parameter, index) => {
                const symbol = checker.getSymbolAtLocation(parameter.name)
                const value = resolveString(node.arguments[index], checker, bindings)
                if (symbol && value) nestedBindings.set(symbol, value)
              })
              inspect(declaration.body, nestedBindings)
            }
          }
        }
      }
      ts.forEachChild(node, child => inspect(child, bindings))
    }
    for (const handler of handlerNodes) inspect(handler)
  }
  return validated
}

function assertTrustedValidator(
  expression: ts.Expression,
  name: string,
  checker: ts.TypeChecker,
  operation: string,
): void {
  const symbol = ts.isIdentifier(expression) ? checker.getSymbolAtLocation(expression) : undefined
  const target =
    symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol)
  const trusted = {
    validateRequestContract: '/backend/api/response-helpers.mts',
    parseAndValidatePaginatedRequest: '/backend/api/validate-paginated-query.mts',
    parseAndValidateCaseListQuery: '/backend/api/case-list-query-helpers.mts',
  }[name]
  if (
    !trusted ||
    !target?.declarations?.some(declaration =>
      declaration.getSourceFile().fileName.replaceAll('\\', '/').endsWith(trusted),
    )
  ) {
    throw new Error(`${name} in ${operation} is not the trusted backend validator`)
  }
}

function assertTrustedVoteFactory(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  operation: string,
): void {
  const symbol = ts.isIdentifier(expression) ? checker.getSymbolAtLocation(expression) : undefined
  const target =
    symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol)
  if (
    !target?.declarations?.some(declaration =>
      declaration
        .getSourceFile()
        .fileName.replaceAll('\\', '/')
        .endsWith('/backend/api/election-vote-handler.mts'),
    )
  ) {
    throw new Error(`Vote handler factory in ${operation} is not the trusted backend factory`)
  }
}

export function routeKey(route: Pick<Route, 'method' | 'routeTemplate'>): string {
  return `${route.method}:${route.routeTemplate}`
}

export function discoverThirdPartyRoutes(): Route[] {
  return loadRegisteredRouteCatalog().filter(isThirdPartyRoute)
}

function isThirdPartyRoute(route: Route): boolean {
  return route.routeTemplate.startsWith('/api/v1/')
}
