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

export function staticSqlTemplateText(node: Node | undefined): string | null {
  const template =
    node?.type === 'TaggedTemplateExpression' &&
    isNode(node.tag) &&
    propertyName(node.tag) === 'sql' &&
    isNode(node.quasi)
      ? node.quasi
      : node?.type === 'TemplateLiteral'
        ? node
        : null
  if (!template || template.type !== 'TemplateLiteral' || !Array.isArray(template.quasis))
    return null
  return template.quasis
    .flatMap((quasi, index) => {
      if (!isNode(quasi) || typeof quasi.value !== 'object' || quasi.value === null) return []
      const raw = (quasi.value as { raw?: unknown }).raw
      if (typeof raw !== 'string') return []
      return index === 0 ? [raw] : [`reader_inventory_placeholder_${index}`, raw]
    })
    .join('')
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

export function terminalSqlExecutorBindings(ast: Node): Set<string> {
  const bindings = new Set<string>()
  walk(ast, node => {
    if (
      node.type !== 'ImportDeclaration' ||
      !isNode(node.source) ||
      node.source.type !== 'Literal' ||
      node.source.value !== '@data-stores/psql' ||
      !Array.isArray(node.specifiers)
    ) {
      return
    }
    for (const specifier of node.specifiers) {
      if (!isNode(specifier) || specifier.type !== 'ImportSpecifier') continue
      if (!isNode(specifier.imported) || !isNode(specifier.local)) continue
      const importedName = propertyName(specifier.imported)
      const localName = propertyName(specifier.local)
      if (
        importedName &&
        localName &&
        ['read', 'write', 'query', 'readStream', 'explainAnalyze'].includes(importedName)
      ) {
        bindings.add(localName)
      }
    }
  })
  walk(ast, node => {
    if (node.type !== 'VariableDeclarator' || !isNode(node.id) || !isNode(node.init)) return
    const binding = propertyName(node.id)
    if (!binding || node.init.type !== 'ConditionalExpression') return
    const consequent = propertyName(isNode(node.init.consequent) ? node.init.consequent : undefined)
    const alternate = propertyName(isNode(node.init.alternate) ? node.init.alternate : undefined)
    if ((consequent && bindings.has(consequent)) || (alternate && bindings.has(alternate))) {
      bindings.add(binding)
    }
  })
  return bindings
}

export function isTerminalSqlCall(node: Node, bindings: Set<string>): boolean {
  if (node.type !== 'CallExpression' || !isNode(node.callee)) return false
  return node.callee.type === 'Identifier' && bindings.has(propertyName(node.callee) ?? '')
}

function collectEligibleImports(
  node: Node,
  source: string,
  symbols: string[],
  imported: Set<string>,
): void {
  if (!Array.isArray(node.specifiers)) return
  for (const specifier of node.specifiers) {
    if (!isNode(specifier) || specifier.type !== 'ImportSpecifier') continue
    if (!isNode(specifier.imported) || !isNode(specifier.local)) continue
    const importedName = propertyName(specifier.imported)
    const localName = propertyName(specifier.local)
    if (
      importedName &&
      localName &&
      symbols.includes(importedName) &&
      allowedImportSources(importedName).has(source)
    ) {
      imported.add(localName)
    }
  }
}

function allowedImportSources(symbol: string): Set<string> {
  if (symbol === 'buildDirectPostEligibilityFilter') {
    return new Set(['@modules/feed-query-builders', './post-publication-eligibility.mts'])
  }
  if (symbol === 'buildDirectPostAccessFilter') return new Set(['./direct-access-filter.mts'])
  if (symbol === 'buildPublicPostEligibilityFilter') {
    return new Set(['@modules/feed-query-builders', './post-publication-eligibility.mts'])
  }
  if (symbol === 'buildViewerPostDiscoveryEligibilityFilter') {
    return new Set(['@modules/feed-query-builders', './post-publication-eligibility.mts'])
  }
  if (symbol === 'getPublicPostIds') return new Set(['@services/posts'])
  if (symbol === 'getVisibleCommentDescendantIdsPage') return new Set(['@services/comments'])
  if (symbol === 'getVisiblePostStoryIdsByStoryIds') return new Set(['@services/stories'])
  return new Set(['@services/posts', '@services/posts/check-privacy-access'])
}
