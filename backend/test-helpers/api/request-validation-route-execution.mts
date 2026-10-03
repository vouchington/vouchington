import ts from 'typescript'

import { resolveAlias } from './request-validation-route-ast.mts'

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
