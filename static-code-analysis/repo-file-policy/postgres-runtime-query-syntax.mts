import { isNode, propertyName } from '../targeted-guardrails/ast-utils.mts'

export type QueryNode = import('../targeted-guardrails/ast-utils.mts').UnknownNode

export function queryNodeText(node: QueryNode | undefined): string | null {
  if (!node) return null
  if (
    (node.type === 'TSAsExpression' ||
      node.type === 'TSSatisfiesExpression' ||
      node.type === 'TSNonNullExpression' ||
      node.type === 'ParenthesizedExpression' ||
      node.type === 'ChainExpression') &&
    isNode(node.expression)
  ) {
    return queryNodeText(node.expression)
  }
  if (node.type === 'Literal') return typeof node.value === 'string' ? node.value : null
  if (node.type === 'TaggedTemplateExpression' && isNode(node.quasi))
    return queryNodeText(node.quasi)
  if (node.type !== 'TemplateLiteral' || !Array.isArray(node.quasis)) return null

  let parameter = 0
  return node.quasis
    .flatMap((quasi, index) => {
      if (!isNode(quasi) || typeof quasi.value !== 'object' || quasi.value === null) return []
      const raw = (quasi.value as { raw?: unknown }).raw
      if (typeof raw !== 'string') return []
      return index === 0 ? [raw] : [`sql_placeholder_${++parameter}`, raw]
    })
    .join('')
}
export function isStaticallyAnalyzableInitializer(
  node: QueryNode | undefined,
  sqlTags: Set<string>,
): boolean {
  if (!node) return false
  const unwrapped = unwrapQueryNode(node)
  if (unwrapped !== node) return isStaticallyAnalyzableInitializer(unwrapped, sqlTags)
  if (node.type === 'Literal') return typeof node.value === 'string'
  if (node.type === 'TaggedTemplateExpression' && isNode(node.tag)) {
    return sqlTags.has(propertyName(node.tag) ?? '') && isNode(node.quasi)
  }
  return (
    node.type === 'TemplateLiteral' &&
    Array.isArray(node.expressions) &&
    node.expressions.length === 0
  )
}
export function unwrapQueryNode(node: QueryNode | undefined): QueryNode | undefined {
  if (
    node &&
    (node.type === 'TSAsExpression' ||
      node.type === 'TSSatisfiesExpression' ||
      node.type === 'TSNonNullExpression' ||
      node.type === 'ParenthesizedExpression' ||
      node.type === 'ChainExpression') &&
    isNode(node.expression)
  ) {
    return unwrapQueryNode(node.expression)
  }
  return node
}
