import { classifyDynamicUse } from './postgres-runtime-query-dynamic-use.mts'
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

export { classifyDynamicUse }
