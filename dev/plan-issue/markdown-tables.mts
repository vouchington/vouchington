import { isMeaningfulEvidence, isMeaningfulOrJustifiedAbsence } from './evidence-values.mts'
import { containsNode, visibleText, type MarkdownNode } from './markdown.mts'

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

export function tableColumnValues(nodes: MarkdownNode[], header: string): string[] {
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
