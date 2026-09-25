import {
  findMarkdownNode as findPackageMarkdownNode,
  type MarkdownNode as PackageMarkdownNode,
} from 'vouchington-tooling/markdown'

import { isMeaningfulEvidence, isMeaningfulOrJustifiedAbsence } from './evidence-values.mts'

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

// findMarkdownNode walks a node pre-order (self, then children, depth-first), which matches this
// function's previous hand-written recursive walk once the sibling array is wrapped as a synthetic
// root; no predicate here matches `type === 'root'`, so the wrapper node itself never affects the
// result. The plan-issue MarkdownNode shape is deliberately looser than the package's strict mdast
// union (see its type above), so the boundary casts through `unknown`.
export function containsNode(
  nodes: MarkdownNode[],
  predicate: (node: MarkdownNode) => boolean,
): boolean {
  const root = { type: 'root', children: nodes } as unknown as PackageMarkdownNode
  return (
    findPackageMarkdownNode(root, candidate => predicate(candidate as unknown as MarkdownNode)) !==
    null
  )
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

export function hasTableHeaders(
  nodes: MarkdownNode[],
  required: string[],
  optionalAbsence: string[] = [],
  parserOwnedEvidence: string[] = [],
): boolean {
  const tables: MarkdownNode[] = []
  containsNode(nodes, node => {
    if (node.type === 'table') tables.push(node)
    return false
  })
  if (tables.length !== 1) return false
  const rows = tables[0].children ?? []
  const headers = (rows[0]?.children ?? []).map(cell => visibleText(cell).trim().toLowerCase())
  const indexes = required.map(name => headers.indexOf(name))
  const requiredIndexes = new Set(indexes)
  const extrasMeaningful = rows
    .slice(1)
    .every(row =>
      (row.children ?? []).every(
        (cell, index) =>
          requiredIndexes.has(index) || isMeaningfulEvidence(inlineEvidenceText(cell)),
      ),
    )
  return (
    indexes.every(index => index >= 0) &&
    rows.length > 1 &&
    extrasMeaningful &&
    rows
      .slice(1)
      .every(row =>
        indexes.every((index, requiredIndex) =>
          parserOwnedEvidence.includes(required[requiredIndex])
            ? true
            : (optionalAbsence.includes(required[requiredIndex])
                ? isMeaningfulOrJustifiedAbsence
                : isMeaningfulEvidence)(
                inlineEvidenceText(row.children?.[index] ?? { type: 'root' }),
              ),
        ),
      )
  )
}

function tableColumnValues(nodes: MarkdownNode[], header: string): string[] {
  const values: string[] = []
  for (const node of nodes) {
    if (node.type === 'table') {
      const rows = node.children ?? []
      const headers = (rows[0]?.children ?? []).map(cell => visibleText(cell).trim().toLowerCase())
      const index = headers.indexOf(header)
      if (index >= 0) {
        values.push(
          ...rows
            .slice(1)
            .map(row => inlineEvidenceText(row.children?.[index] ?? { type: 'root' }).trim()),
        )
      }
    }
    values.push(...tableColumnValues(node.children ?? [], header))
  }
  return values
}

export function hasRequiredAlternativeClasses(nodes: MarkdownNode[]): boolean {
  const alternatives = tableColumnValues(nodes, 'alternative')
  return [/^no[- ]change\b/i, /^reuse\b/i, /^materially different\b/i].every(category =>
    alternatives.some(alternative => category.test(alternative)),
  )
}

function inlineEvidenceText(node: MarkdownNode): string {
  if (node.type === 'html' || node.type === 'code') return ''
  return [node.value, node.alt, ...(node.children ?? []).map(inlineEvidenceText)]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
}

export function labeledListFields(nodes: MarkdownNode[], allowed: string[]): Map<string, string[]> {
  const output = new Map<string, string[]>()
  const allowedPattern = allowed.map(name => name.replaceAll('/', '\\/')).join('|')
  containsNode(nodes, node => {
    if (node.type !== 'listItem') return false
    const ownChildren = (node.children ?? []).filter(child => child.type !== 'list')
    const match = new RegExp(`^(${allowedPattern})\\s*:\\s*(.*)$`, 'i').exec(
      inlineEvidenceText({ type: 'root', children: ownChildren }).trim(),
    )
    if (match === null) return false
    const name = match[1].toLowerCase()
    output.set(name, [...(output.get(name) ?? []), match[2].trim()])
    return false
  })
  return output
}
