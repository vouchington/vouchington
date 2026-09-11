import {
  containsNode,
  hasNonApplicableBranch,
  hasSpecificNonApplicable,
  hasTableHeaders,
  type MarkdownNode,
  visibleText,
} from './markdown.mts'
import { isMeaningfulEvidence } from './evidence-values.mts'

export function hasMeaningfulField(fields: Map<string, string[]>, name: string): boolean {
  const values = fields.get(name) ?? []
  return values.length > 0 && values.every(isMeaningfulEvidence)
}

export function requireTable(
  errors: string[],
  byName: Map<string, MarkdownNode[]>,
  section: string,
  headers: string[],
  allowNonApplicable = false,
  optionalAbsence: string[] = [],
  parserOwnedEvidence: string[] = [],
): void {
  const nodes = byName.get(section) ?? []
  const display = section === 'kpis' ? 'KPIs' : section.replace(/^./, char => char.toUpperCase())
  const hasTable = containsNode(nodes, node => node.type === 'table')
  if (allowNonApplicable && hasNonApplicableBranch(nodes)) {
    if (!hasSpecificNonApplicable(nodes)) {
      errors.push(`${display} has an invalid "Not applicable:" reason.`)
      return
    }
    if (!hasTable) return
    errors.push(`${display} must remove its table when using a "Not applicable:" reason.`)
    return
  }
  if (!hasTableHeaders(nodes, headers, optionalAbsence, parserOwnedEvidence))
    errors.push(`${display} must include a table with columns: ${headers.join(', ')}.`)
}

export function hasMeaningfulOrderedSteps(nodes: MarkdownNode[]): boolean {
  const orderedLists: MarkdownNode[] = []
  containsNode(nodes, node => {
    if (node.type === 'list' && !!node.ordered) orderedLists.push(node)
    return false
  })
  return (
    orderedLists.length > 0 &&
    orderedLists.every(list => {
      const items = (list.children ?? []).filter(node => node.type === 'listItem')
      return (
        items.length > 0 &&
        items.every(item => {
          const ownChildren = (item.children ?? []).filter(child => child.type !== 'list')
          return isMeaningfulEvidence(visibleText({ type: 'root', children: ownChildren }))
        })
      )
    })
  )
}

export function hasPlausibleMermaidDiagram(nodes: MarkdownNode[]): boolean {
  return containsNode(nodes, node => {
    if (node.type !== 'code' || node.lang?.toLowerCase() !== 'mermaid') return false
    return (node.value?.trim() ?? '') !== ''
  })
}
