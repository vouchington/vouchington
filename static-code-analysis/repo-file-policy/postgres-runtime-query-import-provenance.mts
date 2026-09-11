import { isFunctionLike, isNode, propertyName } from '../targeted-guardrails/ast-utils.mts'

import { collectBindingNames } from './postgres-runtime-query-binding-resolution.mts'
import { visitCurrentScope } from './postgres-runtime-query-lexical-scope.mts'
import type { QueryNode } from './postgres-runtime-query-syntax.mts'

export function transactionCallbackParameters(
  ast: QueryNode,
  helpers: Map<string, number>,
): Map<QueryNode, string> {
  const callbacks = new Map<QueryNode, string>()
  visitAll(ast, node => {
    if (node.type !== 'CallExpression' || !isNode(node.callee) || node.callee.type !== 'Identifier')
      return
    const helper = propertyName(node.callee)
    const callbackIndex = helper ? helpers.get(helper) : undefined
    if (callbackIndex === undefined || !Array.isArray(node.arguments)) return
    const callback = node.arguments[callbackIndex]
    if (!isNode(callback) || !isFunctionLike(callback) || !Array.isArray(callback.params)) return
    const parameter = callback.params[0]
    if (!isNode(parameter)) return
    const names = new Set<string>()
    collectBindingNames(parameter, names)
    if (names.size === 1) callbacks.set(callback, [...names][0]!)
  })
  return callbacks
}

export function transactionHelperIndexes(ast: QueryNode): Map<string, number> {
  const helpers = new Map<string, number>()
  visitCurrentScope(ast, node => {
    if (
      node.type !== 'ImportDeclaration' ||
      !isNode(node.source) ||
      node.source.value !== '@data-stores/psql' ||
      !Array.isArray(node.specifiers)
    )
      return
    for (const specifier of node.specifiers) {
      if (!isNode(specifier) || !isNode(specifier.local) || !isNode(specifier.imported)) continue
      const imported = propertyName(specifier.imported)
      const local = propertyName(specifier.local)
      if (local && imported === 'withTransactionOptions') helpers.set(local, 1)
    }
  })
  return helpers
}

export function visitAll(node: QueryNode, visit: (node: QueryNode) => void): void {
  visit(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) visitAll(child, visit)
    } else if (isNode(value)) {
      visitAll(value, visit)
    }
  }
}

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
