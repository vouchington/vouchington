import { isNode } from '../targeted-guardrails/ast-utils.mts'

import { markDynamic, markExportedDeclaration } from './postgres-runtime-query-escapes.mts'
import type { QueryNode } from './postgres-runtime-query-syntax.mts'
import type { ScopeBinding } from './postgres-runtime-query-types.mts'

export function classifyDynamicMutation(
  node: QueryNode,
  scopes: Array<Map<string, ScopeBinding>>,
): void {
  if (node.type === 'AssignmentExpression' && isNode(node.left)) {
    markDynamic(node.left, scopes, true)
    if (isNode(node.right)) markDynamic(node.right, scopes, true)
    return
  }
  if (
    (node.type === 'ForInStatement' || node.type === 'ForOfStatement') &&
    isNode(node.left) &&
    node.left.type !== 'VariableDeclaration'
  ) {
    markDynamic(node.left, scopes, true)
    return
  }
  if (node.type === 'UpdateExpression' && isNode(node.argument)) {
    markDynamic(node.argument, scopes)
    return
  }
  if (
    node.type === 'CallExpression' &&
    isNode(node.callee) &&
    node.callee.type === 'MemberExpression' &&
    isNode(node.callee.object)
  ) {
    markDynamic(node.callee.object, scopes)
  }
  if (node.type === 'NewExpression' && Array.isArray(node.arguments)) {
    for (const argument of node.arguments) if (isNode(argument)) markDynamic(argument, scopes, true)
  }
  if (node.type === 'ExportDefaultDeclaration' && isNode(node.declaration)) {
    markExportedDeclaration(node.declaration, scopes)
  }
  if (node.type === 'ExportNamedDeclaration') {
    if (isNode(node.declaration)) markExportedDeclaration(node.declaration, scopes)
    if (Array.isArray(node.specifiers)) {
      for (const specifier of node.specifiers) {
        if (isNode(specifier) && isNode(specifier.local)) markDynamic(specifier.local, scopes)
      }
    }
  }
}
