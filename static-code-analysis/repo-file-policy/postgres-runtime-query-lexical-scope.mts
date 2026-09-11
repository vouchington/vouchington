import { isFunctionLike, isNode, propertyName } from '../targeted-guardrails/ast-utils.mts'

import { collectBindingNames } from './postgres-runtime-query-binding-resolution.mts'
import { predeclareFunctionScopedVars } from './postgres-runtime-query-function-vars.mts'
import {
  isStaticallyAnalyzableInitializer,
  queryNodeText,
  type QueryNode,
} from './postgres-runtime-query-syntax.mts'
import type { ScopeBinding } from './postgres-runtime-query-types.mts'

const SCOPE_CREATORS = new Set([
  'BlockStatement',
  'CatchClause',
  'ForInStatement',
  'ForOfStatement',
  'ForStatement',
  'Program',
  'StaticBlock',
  'SwitchStatement',
])

export function createsScope(node: QueryNode): boolean {
  return SCOPE_CREATORS.has(node.type ?? '') || isFunctionLike(node)
}

export function visitCurrentScope(
  node: QueryNode,
  visit: (node: QueryNode) => void,
  root = true,
): void {
  if (!root && createsScope(node)) {
    visit(node)
    return
  }
  visit(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) visitCurrentScope(child, visit, false)
      }
    } else if (isNode(value)) {
      visitCurrentScope(value, visit, false)
    }
  }
}

export function predeclareScope(
  node: QueryNode,
  scope: Map<string, ScopeBinding>,
  sqlTags: Set<string>,
): Set<string> {
  const availableSqlTags = new Set(sqlTags)
  if (isFunctionLike(node) && isNode(node.id)) {
    const name = propertyName(node.id)
    if (name) {
      scope.set(name, null)
      availableSqlTags.delete(name)
    }
  }
  if (isFunctionLike(node) && Array.isArray(node.params)) {
    for (const parameter of node.params) {
      if (!isNode(parameter)) continue
      const names = new Set<string>()
      collectBindingNames(parameter, names)
      for (const name of names) {
        scope.set(name, null)
        availableSqlTags.delete(name)
      }
    }
  }
  if (node.type === 'CatchClause' && isNode(node.param)) {
    const names = new Set<string>()
    collectBindingNames(node.param, names)
    for (const name of names) {
      scope.set(name, null)
      availableSqlTags.delete(name)
    }
  }
  if (node.type === 'Program' || node.type === 'StaticBlock') {
    predeclareFunctionScopedVars(node, scope, availableSqlTags)
  }

  visitCurrentScope(node, child => {
    if (
      (child.type === 'FunctionDeclaration' || child.type === 'ClassDeclaration') &&
      isNode(child.id)
    ) {
      const name = propertyName(child.id)
      if (name) {
        scope.set(name, null)
        availableSqlTags.delete(name)
      }
      return
    }
    if (child.type !== 'VariableDeclaration' || !Array.isArray(child.declarations)) return
    for (const declarator of child.declarations) {
      if (
        !isNode(declarator) ||
        declarator.type !== 'VariableDeclarator' ||
        !isNode(declarator.id)
      ) {
        continue
      }
      const name = propertyName(declarator.id)
      if (child.kind === 'var') continue
      if (!name) {
        const names = new Set<string>()
        collectBindingNames(declarator.id, names)
        for (const bindingName of names) scope.set(bindingName, null)
        continue
      }
      availableSqlTags.delete(name)
      const initializer = isNode(declarator.init) ? declarator.init : undefined
      scope.set(name, {
        callUses: [],
        declaration: declarator,
        initializer,
        isStaticallyAnalyzable:
          child.kind === 'const' &&
          isStaticallyAnalyzableInitializer(initializer, availableSqlTags),
        text: queryNodeText(initializer),
      })
    }
  })
  return availableSqlTags
}
