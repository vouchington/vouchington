import ts from 'typescript'

import { resolvedName } from './request-validation-route-ast.mts'

/** Validator projection reads shape its own input; they are not downstream consumption. */
export function recordQueryReadSite(
  node: ts.Node,
  checker: ts.TypeChecker,
  operation: string,
  sitesByOperation?: Map<string, ts.Node[]>,
): void {
  if (!sitesByOperation || insideValidatorProjection(node, checker)) return
  const sites = sitesByOperation.get(operation) ?? []
  sites.push(node)
  sitesByOperation.set(operation, sites)
}

function insideValidatorProjection(node: ts.Node, checker: ts.TypeChecker): boolean {
  let current: ts.Node | undefined = node.parent
  while (current && !ts.isFunctionLike(current)) {
    if (ts.isCallExpression(current)) {
      const name = resolvedName(current.expression, checker)
      if (
        name === 'validateRequestContract' ||
        name === 'parseAndValidatePaginatedRequest' ||
        name === 'parseAndValidateCaseListQuery'
      )
        return true
    }
    current = current.parent
  }
  return false
}
