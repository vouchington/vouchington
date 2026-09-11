import { isFunctionLike, isNode } from '../targeted-guardrails/ast-utils.mts'

import { collectBindingNames } from './postgres-runtime-query-binding-resolution.mts'
import { queryNodeText, type QueryNode } from './postgres-runtime-query-syntax.mts'
import type { ScopeBinding } from './postgres-runtime-query-types.mts'

export function predeclareFunctionScopedVars(
  node: QueryNode,
  scope: Map<string, ScopeBinding>,
  sqlTags: Set<string>,
): void {
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue
    const children = Array.isArray(value) ? value : [value]
    for (const child of children) {
      if (!isNode(child) || isFunctionLike(child) || child.type === 'StaticBlock') continue
      if (
        child.type === 'VariableDeclaration' &&
        child.kind === 'var' &&
        Array.isArray(child.declarations)
      ) {
        for (const declarator of child.declarations) {
          if (!isNode(declarator) || !isNode(declarator.id)) continue
          const names = new Set<string>()
          collectBindingNames(declarator.id, names)
          for (const name of names) {
            const initializer = isNode(declarator.init) ? declarator.init : undefined
            scope.set(
              name,
              declarator.id.type === 'Identifier'
                ? {
                    callUses: [],
                    declaration: declarator,
                    initializer,
                    isStaticallyAnalyzable: false,
                    text: queryNodeText(initializer),
                  }
                : null,
            )
            sqlTags.delete(name)
          }
        }
      }
      predeclareFunctionScopedVars(child, scope, sqlTags)
    }
  }
}
