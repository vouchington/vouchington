import { isNode, propertyName } from '../targeted-guardrails/ast-utils.mts'

import { visitCurrentScope } from './postgres-runtime-query-lexical-scope.mts'
import type { QueryNode } from './postgres-runtime-query-syntax.mts'

export function importedDefaultNames(ast: QueryNode, sourceName: string): Set<string> {
  const names = new Set<string>()
  visitCurrentScope(ast, node => {
    if (
      node.type !== 'ImportDeclaration' ||
      !isNode(node.source) ||
      node.source.value !== sourceName ||
      !Array.isArray(node.specifiers)
    )
      return
    for (const specifier of node.specifiers) {
      if (
        isNode(specifier) &&
        specifier.type === 'ImportDefaultSpecifier' &&
        isNode(specifier.local)
      ) {
        const name = propertyName(specifier.local)
        if (name) names.add(name)
      }
    }
  })
  return names
}

export function importedNamedNames(ast: QueryNode, names: Set<string>): Set<string> {
  const result = new Set<string>()
  visitCurrentScope(ast, node => {
    if (
      node.type !== 'ImportDeclaration' ||
      !isNode(node.source) ||
      node.source.value !== '@data-stores/psql' ||
      !Array.isArray(node.specifiers)
    )
      return
    for (const specifier of node.specifiers) {
      if (!isNode(specifier) || !isNode(specifier.local)) continue
      const imported = isNode(specifier.imported) ? propertyName(specifier.imported) : null
      const local = propertyName(specifier.local)
      if (imported && local && names.has(imported)) result.add(local)
    }
  })
  return result
}
