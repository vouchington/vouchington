import { isNode, propertyName } from '../targeted-guardrails/ast-utils.mts'

import type { QueryNode } from './postgres-runtime-query-syntax.mts'
import type { ScopeBinding } from './postgres-runtime-query-types.mts'

export function collectBindingNames(node: QueryNode, names: Set<string>): void {
  if (node.type === 'TSParameterProperty' && isNode(node.parameter)) {
    collectBindingNames(node.parameter, names)
    return
  }
  const name = propertyName(node)
  if (node.type === 'Identifier' && name) {
    names.add(name)
    return
  }
  if (
    (node.type === 'RestElement' || node.type === 'AssignmentPattern') &&
    isNode(node.argument ?? node.left)
  ) {
    collectBindingNames((node.argument ?? node.left) as QueryNode, names)
    return
  }
  if (node.type === 'ObjectPattern' && Array.isArray(node.properties)) {
    for (const property of node.properties) {
      if (!isNode(property)) continue
      if (property.type === 'Property' && isNode(property.value)) {
        collectBindingNames(property.value, names)
      } else if (property.type === 'RestElement') {
        collectBindingNames(property, names)
      }
    }
    return
  }
  if (node.type === 'ArrayPattern' && Array.isArray(node.elements)) {
    for (const element of node.elements) {
      if (isNode(element)) collectBindingNames(element, names)
    }
  }
}

export function bindingFromScopes(
  name: string,
  scopes: Array<Map<string, ScopeBinding>>,
): ScopeBinding {
  for (let index = scopes.length - 1; index >= 0; index--) {
    const scope = scopes[index]
    if (scope?.has(name)) return scope.get(name) ?? null
  }
  return null
}

export function rootBinding(
  target: QueryNode | undefined,
  scopes: Array<Map<string, ScopeBinding>>,
): ScopeBinding {
  if (!target) return null
  if (
    (target.type === 'TSAsExpression' ||
      target.type === 'TSSatisfiesExpression' ||
      target.type === 'TSNonNullExpression' ||
      target.type === 'ParenthesizedExpression' ||
      target.type === 'ChainExpression') &&
    isNode(target.expression)
  ) {
    return rootBinding(target.expression, scopes)
  }
  if (target.type === 'Identifier') {
    const name = propertyName(target)
    return name ? bindingFromScopes(name, scopes) : null
  }
  return target.type === 'MemberExpression' && isNode(target.object)
    ? rootBinding(target.object, scopes)
    : null
}
