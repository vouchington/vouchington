import { isFunctionLike, isNode } from '../targeted-guardrails/ast-utils.mts'

import { collectBindingNames } from './postgres-runtime-query-binding-resolution.mts'
import { predeclareFunctionScopedVars } from './postgres-runtime-query-function-vars.mts'
import { createsScope, predeclareScope } from './postgres-runtime-query-lexical-scope.mts'
import type { QueryNode } from './postgres-runtime-query-syntax.mts'

function patternHasName(node: QueryNode | undefined, name: string): boolean {
  if (!node) return false
  const names = new Set<string>()
  collectBindingNames(node, names)
  return names.has(name)
}

export function hasBindingWrite(node: QueryNode, name: string, root = true): boolean {
  let functionBodyShadows = false
  if (!root && createsScope(node)) {
    const scope = new Map()
    predeclareScope(node, scope, new Set())
    if (scope.has(name)) return false
    if (isFunctionLike(node)) {
      const bodyScope = new Map()
      predeclareFunctionScopedVars(node, bodyScope, new Set())
      functionBodyShadows = bodyScope.has(name)
    }
  }
  if (
    (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') &&
    isNode(node.argument ?? node.left) &&
    patternHasName((node.argument ?? node.left) as QueryNode, name)
  ) {
    return true
  }
  if (node.type === 'VariableDeclarator' && isNode(node.id) && patternHasName(node.id, name)) {
    return true
  }
  if (
    (node.type === 'ForInStatement' || node.type === 'ForOfStatement') &&
    isNode(node.left) &&
    node.left.type !== 'VariableDeclaration' &&
    patternHasName(node.left, name)
  ) {
    return true
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue
    if (functionBodyShadows && key === 'body') continue
    const children = Array.isArray(value) ? value : [value]
    for (const child of children) {
      if (isNode(child) && hasBindingWrite(child, name, false)) return true
    }
  }
  return false
}
