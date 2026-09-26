import { isNode, propertyName } from '../targeted-guardrails/ast-utils.mts'
type Node = import('../targeted-guardrails/ast-utils.mts').UnknownNode

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

export function allowedImportSources(symbol: string): Set<string> {
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

export function collectEligibleImports(
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
