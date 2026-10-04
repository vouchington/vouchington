import ts from 'typescript'

import { loadRegisteredRouteCatalog } from '../api-fixtures/backend-contract-catalog.mts'
import { loadBackendProgram } from '../api-fixtures/backend-program.mts'
import { isExecutedAdmissionCallback } from './request-validation-route-execution.mts'
import { findRegistration, resolveHandlerNodes } from './request-validation-route-ast.mts'
import {
  isIdentifierSymbol,
  isImportedUuidValidator,
  isRequestIdAlias,
  type UuidValidatorTrust,
  unwrapIdentifier,
} from './request-validation-route-specialized-carriers.mts'

type Route = Pick<
  ReturnType<typeof loadRegisteredRouteCatalog>[number],
  'method' | 'routeTemplate' | 'source'
>

export function discoverInlineUuidQueryAssertions(): Set<string> {
  const backend = loadBackendProgram()
  return discoverInlineUuidQueryAssertionsForProgram(
    backend.program,
    backend.apiSourceFiles,
    loadRegisteredRouteCatalog(),
  )
}

export function discoverInlineUuidQueryAssertionsForProgram(
  program: ts.Program,
  routeFiles: readonly ts.SourceFile[],
  routes: readonly Route[],
  trustUuidValidator: UuidValidatorTrust = (node, checker) =>
    isImportedUuidValidator(node, checker, '@modules/utils'),
): Set<string> {
  const checker = program.getTypeChecker()
  const operations = new Set<string>()
  for (const route of routes) {
    const [fileName, lineText] = route.source.split(':')
    const source = routeFiles.find(file =>
      file.fileName.replaceAll('\\', '/').endsWith(`/${fileName}`),
    )
    if (!source) throw new Error(`Cannot resolve route source ${route.source}`)
    const registration = findRegistration(source, route, Number(lineText))
    const handlers = registration.arguments.flatMap(argument =>
      resolveHandlerNodes(argument, checker),
    )
    for (const handler of handlers) {
      const firstParameter = ts.isFunctionLike(handler) ? handler.parameters[0]?.name : undefined
      const context =
        firstParameter && ts.isIdentifier(firstParameter)
          ? checker.getSymbolAtLocation(firstParameter)
          : undefined
      const visit = (node: ts.Node): void => {
        if (
          ts.isFunctionLike(node) &&
          node !== handler &&
          !isExecutedAdmissionCallback(node, checker)
        )
          return
        if (isSpecializedRequestIdAssertion(node, checker, context, trustUuidValidator)) {
          operations.add(`${route.method}:${route.routeTemplate}`)
        }
        ts.forEachChild(node, visit)
      }
      visit(handler)
    }
  }
  return operations
}

function isSpecializedRequestIdAssertion(
  node: ts.Node,
  checker: ts.TypeChecker,
  context: ts.Symbol | undefined,
  trustUuidValidator: UuidValidatorTrust,
): node is ts.CallExpression {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.name.text !== 'assert' ||
    !isIdentifierSymbol(node.expression.expression, checker, context) ||
    !ts.isNumericLiteral(node.arguments[1]) ||
    node.arguments[1].text !== '422' ||
    !node.arguments[0] ||
    !ts.isBinaryExpression(node.arguments[0]) ||
    node.arguments[0].operatorToken.kind !== ts.SyntaxKind.BarBarToken
  ) {
    return false
  }

  const [guard, validation] = [node.arguments[0].left, node.arguments[0].right]
  if (!ts.isPrefixUnaryExpression(guard) || guard.operator !== ts.SyntaxKind.ExclamationToken) {
    return false
  }
  const requestId = unwrapIdentifier(guard.operand)
  if (!requestId || !isRequestIdAlias(requestId, checker, context, new Set())) return false
  if (
    !ts.isCallExpression(validation) ||
    !ts.isIdentifier(validation.expression) ||
    !trustUuidValidator(validation.expression, checker)
  ) {
    return false
  }
  const uuidArgument = unwrapIdentifier(validation.arguments[0])
  return (
    !!uuidArgument &&
    checker.getSymbolAtLocation(uuidArgument) === checker.getSymbolAtLocation(requestId)
  )
}
