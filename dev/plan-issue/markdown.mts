import { hasTableHeaders, labeledListFields, tableColumnValues } from './markdown-tables.mts'

export { hasTableHeaders, labeledListFields, tableColumnValues }
import { isMeaningfulEvidence } from './evidence-values.mts'

export type MarkdownNode = {
  alt?: string | null
  children?: MarkdownNode[]
  depth?: number
  lang?: string | null
  ordered?: boolean | null
  type: string
  url?: string
  value?: string
}

// vouchington-tooling's markdownNodeText always includes code/inlineCode/html source text and
// concatenates descendant text with no separator (only a literal 'break' node inserts a space).
// Plan-issue evidence checks need code/html excluded by default and siblings treated as
// space-separated words, so this stays a local implementation rather than delegating.
export function visibleText(node: MarkdownNode, includeCode = false, includeUrls = false): string {
  if (node.type === 'html') return ''
  if ((node.type === 'code' || node.type === 'inlineCode') && !includeCode) return ''
  return [
    node.value,
    node.alt,
    includeUrls ? node.url : undefined,
    ...(node.children ?? []).map(child => visibleText(child, includeCode, includeUrls)),
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
}

export function containsNode(
  nodes: MarkdownNode[],
  predicate: (node: MarkdownNode) => boolean,
): boolean {
  return nodes.some(node => predicate(node) || containsNode(node.children ?? [], predicate))
}

export function hasVisibleEvidence(nodes: MarkdownNode[]): boolean {
  if (hasStandaloneFiller(nodes)) return false
  const value = visibleText({ type: 'root', children: nodes })
  return /^not applicable:/i.test(value.trim())
    ? hasSpecificNonApplicable(nodes)
    : isMeaningfulEvidence(value)
}

export function hasStandaloneFiller(nodes: MarkdownNode[]): boolean {
  return containsNode(nodes, node => {
    if (node.type !== 'paragraph' && node.type !== 'listItem' && node.type !== 'heading')
      return false
    const ownChildren = (node.children ?? []).filter(child => child.type !== 'list')
    const text = visibleText({ type: 'root', children: ownChildren }).trim()
    if (/^not applicable:/i.test(text)) return !hasSpecificNonApplicable([node])
    return text !== '' && !isMeaningfulEvidence(text)
  })
}

export function isResolvedDisposition(value: string): boolean {
  const match =
    /^(?:accepted|rejected)(?:(?:,\s*|\s+)(?:because|with|as)\b\s+|[:;—-]\s*)(\S.*)$/i.exec(value)
  return match !== null && isMeaningfulEvidence(match[1]) && !/^(?:todo|tbd)\b/i.test(match[1])
}

export function hasSpecificNonApplicable(nodes: MarkdownNode[]): boolean {
  return containsNode(nodes, node => {
    if (node.type !== 'paragraph' && node.type !== 'listItem') return false
    const ownChildren = (node.children ?? []).filter(child => child.type !== 'list')
    const text = visibleText({ type: 'root', children: ownChildren }).trim()
    const match = /^not applicable:\s*(.+)$/i.exec(text)
    return match !== null && match[1].length >= 5 && isMeaningfulEvidence(match[1])
  })
}

export function hasNonApplicableBranch(nodes: MarkdownNode[]): boolean {
  return containsNode(nodes, node => {
    if (node.type !== 'paragraph' && node.type !== 'listItem') return false
    const ownChildren = (node.children ?? []).filter(child => child.type !== 'list')
    return /^not applicable:/i.test(visibleText({ type: 'root', children: ownChildren }).trim())
  })
}

export function hasRequiredAlternativeClasses(nodes: MarkdownNode[]): boolean {
  const alternatives = tableColumnValues(nodes, 'alternative')
  return [/^no[- ]change\b/i, /^reuse\b/i, /^materially different\b/i].every(category =>
    alternatives.some(alternative => category.test(alternative)),
  )
}
