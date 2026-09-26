import {
  allowedImportSources,
  collectEligibleImports,
  staticSqlTemplateText,
} from './post-publication-reader-inventory-source-sql.mts'
import { terminalSqlExecutorBindings } from './post-publication-reader-inventory-source-executors.mts'

export {
  allowedImportSources,
  collectEligibleImports,
  staticSqlTemplateText,
  terminalSqlExecutorBindings,
}
import { isNode, propertyName, walk } from '../targeted-guardrails/ast-utils.mts'

type Node = import('../targeted-guardrails/ast-utils.mts').UnknownNode

export function addComposedNames(composed: Set<string>, names: string[]): void {
  for (const name of names) composed.add(name)
}

export function addBindingComposition(
  composed: Set<string>,
  declaration: { declaredAt: number; names: string[] } | undefined,
  reassigned: boolean,
): void {
  if (declaration && !reassigned) addComposedNames(composed, declaration.names)
}

export function canonicalCallNames(node: Node | undefined, imported: Set<string>): string[] {
  const names = new Set<string>()
  if (!node) return []
  walk(node, child => {
    if (
      child.type !== 'CallExpression' ||
      !isNode(child.callee) ||
      child.callee.type !== 'Identifier'
    )
      return
    const name = propertyName(child.callee)
    if (name && imported.has(name)) names.add(name)
  })
  return [...names]
}

export function isAppendCall(node: Node): boolean {
  if (node.type !== 'CallExpression' || !isNode(node.callee)) return false
  if (node.callee.type !== 'MemberExpression' || !isNode(node.callee.property)) return false
  return propertyName(node.callee.property) === 'append'
}

export function isPushCall(node: Node): boolean {
  if (node.type !== 'CallExpression' || !isNode(node.callee)) return false
  if (node.callee.type !== 'MemberExpression' || !isNode(node.callee.property)) return false
  return propertyName(node.callee.property) === 'push'
}

export function appendReceiverName(node: Node): string | null {
  if (node.type !== 'CallExpression' || !isNode(node.callee)) return null
  if (node.callee.type !== 'MemberExpression' || !isNode(node.callee.object)) return null
  return propertyName(node.callee.object)
}

export function isSqlStatementInitializer(node: Node | undefined): boolean {
  return (
    node?.type === 'TaggedTemplateExpression' &&
    isNode(node.tag) &&
    node.tag.type === 'Identifier' &&
    propertyName(node.tag) === 'sql'
  )
}

export function importedCanonicalBindings(ast: Node, symbols: string[]): Set<string> {
  const imported = new Set<string>()
  walk(ast, node => {
    if (
      node.type === 'ImportDeclaration' &&
      isNode(node.source) &&
      node.source.type === 'Literal' &&
      typeof node.source.value === 'string' &&
      Array.isArray(node.specifiers)
    ) {
      collectEligibleImports(node, node.source.value, symbols, imported)
    }
  })
  return imported
}

export function isTerminalSqlCall(node: Node, bindings: Set<string>): boolean {
  if (node.type !== 'CallExpression' || !isNode(node.callee)) return false
  return node.callee.type === 'Identifier' && bindings.has(propertyName(node.callee) ?? '')
}
