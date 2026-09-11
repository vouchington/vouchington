import { isNode } from '../targeted-guardrails/ast-utils.mts'

import { rootBinding } from './postgres-runtime-query-binding-resolution.mts'
import type { QueryNode } from './postgres-runtime-query-syntax.mts'
import type { ScopeBinding } from './postgres-runtime-query-types.mts'

export function markDynamic(
  target: QueryNode | undefined,
  scopes: Array<Map<string, ScopeBinding>>,
  deep = false,
): void {
  const binding = rootBinding(target, scopes)
  if (binding) binding.isStaticallyAnalyzable = false
  if (!deep || !target) return
  if (target.type === 'CallExpression' || target.type === 'NewExpression') return
  if (target.type?.startsWith('TS')) {
    if (isNode(target.expression)) markDynamic(target.expression, scopes, true)
    return
  }
  for (const [key, value] of Object.entries(target)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue
    if (key === 'typeAnnotation' || key === 'typeArguments' || key === 'typeParameters') continue
    if (
      ((target.type === 'MemberExpression' && key === 'property') ||
        (target.type === 'Property' && key === 'key')) &&
      target.computed !== true
    ) {
      continue
    }
    const children = Array.isArray(value) ? value : [value]
    for (const child of children) if (isNode(child)) markDynamic(child, scopes, true)
  }
}

function markExportedDeclaration(
  declaration: QueryNode,
  scopes: Array<Map<string, ScopeBinding>>,
): void {
  if (declaration.type === 'VariableDeclaration' && Array.isArray(declaration.declarations)) {
    for (const declarator of declaration.declarations) {
      if (isNode(declarator) && isNode(declarator.id)) markDynamic(declarator.id, scopes, true)
    }
    return
  }
  if (
    (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') &&
    isNode(declaration.id)
  ) {
    markDynamic(declaration.id, scopes)
    return
  }
  markDynamic(declaration, scopes, true)
}

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
