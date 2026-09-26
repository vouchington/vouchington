import { isNode } from '../targeted-guardrails/ast-utils.mts'
import { rootBinding } from './postgres-runtime-query-binding-resolution.mts'
import type { QueryNode } from './postgres-runtime-query-syntax.mts'
import type { ScopeBinding } from './postgres-runtime-query-types.mts'
import { classifyDynamicMutation } from './postgres-runtime-query-dynamic-mutation.mts'
import { markDynamic } from './postgres-runtime-query-escapes.mts'

export function classifyDynamicUse(
  node: QueryNode,
  scopes: Array<Map<string, ScopeBinding>>,
): void {
  if (node.type === 'VariableDeclarator' && isNode(node.init)) {
    markDynamic(node.init, scopes, true)
    return
  }
  if (node.type === 'ReturnStatement' && isNode(node.argument)) {
    markDynamic(node.argument, scopes, true)
    return
  }
  if (node.type === 'YieldExpression' && isNode(node.argument)) {
    markDynamic(node.argument, scopes, true)
    return
  }
  if (node.type === 'AssignmentPattern' && isNode(node.right)) {
    markDynamic(node.right, scopes, true)
    return
  }
  if (node.type === 'SpreadElement' && isNode(node.argument)) {
    markDynamic(node.argument, scopes, true)
    return
  }
  if (node.type === 'ArrayExpression' && Array.isArray(node.elements)) {
    for (const element of node.elements) if (isNode(element)) markDynamic(element, scopes, true)
    return
  }
  if (node.type === 'ObjectExpression' && Array.isArray(node.properties)) {
    for (const property of node.properties) {
      if (!isNode(property)) continue
      if (property.type === 'Property' && isNode(property.value))
        markDynamic(property.value, scopes, true)
      if (property.type === 'SpreadElement') markDynamic(property, scopes, true)
    }
    return
  }
  classifyDynamicMutation(node, scopes)
}
