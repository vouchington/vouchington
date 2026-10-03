import ts from 'typescript'

import {
  assertTrustedValidator,
  assertTrustedVoteFactory,
} from './request-validation-route-trust.mts'
import { isExecutedAdmissionCallback } from './request-validation-route-execution.mts'
import {
  requestCarrierOrigins,
  type CarrierBindings,
} from './request-validation-route-carrier-origin.mts'
import {
  findRegistration,
  propertyString,
  resolveAlias,
  resolveHandlerNodes,
  resolveString,
  resolvedName,
  resolveExpression,
} from './request-validation-route-ast.mts'

import { routeKey, type Route } from './request-validation-route-catalog.mts'
import {
  recordValidatorCarrierFamilies,
  recordVoteFactoryCarrierFamilies,
} from './request-validation-route-families.mts'
type ValidatorAssertion = typeof assertTrustedValidator
type VoteFactoryAssertion = typeof assertTrustedVoteFactory

const VALIDATORS = new Set([
  'validateRequestContract',
  'parseAndValidatePaginatedRequest',
  'parseAndValidateCaseListQuery',
])

export function discoverRuntimeValidatedOperationsForProgram(
  program: ts.Program,
  routeFiles: readonly ts.SourceFile[],
  routes: readonly Route[],
  assertions: {
    validator?: ValidatorAssertion
    voteFactory?: VoteFactoryAssertion
    carrierFamilies?: Map<string, Set<string>>
  } = {},
): Set<string> {
  const checker = program.getTypeChecker()
  const validated = new Set<string>()
  const assertValidator = assertions.validator ?? assertTrustedValidator
  const assertVoteFactory = assertions.voteFactory ?? assertTrustedVoteFactory

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
    const handlerNodes = registration.arguments.flatMap(argument =>
      resolveHandlerNodes(argument, checker),
    )
    if (handlerNodes.length === 0)
      throw new Error(`Cannot inspect route handler ${routeKey(route)}`)

    const operation = routeKey(route)
    const visited = new Map<ts.Node, Set<string>>()
    const inspect = (
      node: ts.Node,
      bindings: Map<ts.Symbol, string>,
      carrierBindings: CarrierBindings,
    ): void => {
      const bindingKey = [...bindings]
        .map(([symbol, value]) => `${checker.getFullyQualifiedName(symbol)}=${value}`)
        .toSorted()
        .join('|')
      const carrierKey = [...carrierBindings]
        .map(
          ([symbol, value]) =>
            `${checker.getFullyQualifiedName(symbol)}=${[...value].toSorted().join(',')}`,
        )
        .toSorted()
        .join('|')
      const visitKey = `${bindingKey}#${carrierKey}`
      const nodeBindings = visited.get(node) ?? new Set<string>()
      if (nodeBindings.has(visitKey)) return
      nodeBindings.add(visitKey)
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
          assertValidator(node.expression, name, checker, operation)
          const key = resolveString(node.arguments[1], checker, bindings)
          if (!key) throw new Error(`${name} in ${operation} has a non-static operation key`)
          if (key !== operation) throw new Error(`${name} in ${operation} validates ${key}`)
          validated.add(operation)
          recordValidatorCarrierFamilies(
            name,
            node,
            operation,
            checker,
            carrierBindings,
            assertions.carrierFamilies,
          )
          return
        }
        if (name === 'createVoteHandler' || name === 'createVoteClearHandler') {
          assertVoteFactory(node.expression, checker, operation)
          const options = node.arguments[0]
          const optionValue = options && resolveExpression(options, checker)
          const key =
            optionValue &&
            propertyString(optionValue, 'requestContractOperation', checker, bindings)
          if (!key) throw new Error(`${name} in ${operation} has no requestContractOperation`)
          if (key !== operation) throw new Error(`${name} in ${operation} validates ${key}`)
          validated.add(operation)
          recordVoteFactoryCarrierFamilies(name, operation, assertions.carrierFamilies)
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
              inspect(declaration.initializer, bindings, carrierBindings)
            } else if (
              routeFiles.includes(declaration.getSourceFile()) &&
              (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) &&
              declaration.body
            ) {
              const nestedBindings = new Map(bindings)
              const nestedCarrierBindings = new Map(carrierBindings)
              declaration.parameters.forEach((parameter, index) => {
                const symbol = checker.getSymbolAtLocation(parameter.name)
                const value = resolveString(node.arguments[index], checker, bindings)
                if (symbol && value) nestedBindings.set(symbol, value)
                if (symbol && node.arguments[index]) {
                  const origins = requestCarrierOrigins(
                    node.arguments[index],
                    checker,
                    carrierBindings,
                  )
                  if (origins.size > 0) nestedCarrierBindings.set(symbol, origins)
                }
              })
              inspect(declaration.body, nestedBindings, nestedCarrierBindings)
            }
          }
        }
      }
      ts.forEachChild(node, child => inspect(child, bindings, carrierBindings))
    }
    for (const handler of handlerNodes) {
      const carrierBindings: CarrierBindings = new Map()
      if (ts.isFunctionLike(handler)) {
        const context = handler.parameters[0]?.name
        if (context && ts.isIdentifier(context)) {
          const symbol = checker.getSymbolAtLocation(context)
          if (symbol) carrierBindings.set(symbol, new Set(['context']))
        }
      }
      inspect(handler, new Map(), carrierBindings)
    }
  }
  return validated
}
