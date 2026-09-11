import { type MarkdownNode, visibleText } from './markdown.mts'

export function h2Sections(root: MarkdownNode): Map<string, MarkdownNode[]> {
  const children = root.children ?? []
  const sections = new Map<string, MarkdownNode[]>()
  for (const [index, node] of children.entries()) {
    if (node.type !== 'heading' || node.depth !== 2) continue
    const relativeEnd = children
      .slice(index + 1)
      .findIndex(candidate => candidate.type === 'heading' && (candidate.depth ?? 7) <= 2)
    const end = relativeEnd < 0 ? undefined : index + relativeEnd + 1
    sections.set(visibleText(node).trim().toLowerCase(), children.slice(index + 1, end))
  }
  return sections
}

export function h2Counts(root: MarkdownNode): Map<string, number> {
  const counts = new Map<string, number>()
  for (const node of root.children ?? []) {
    if (node.type !== 'heading' || node.depth !== 2) continue
    const name = visibleText(node).trim().toLowerCase()
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return counts
}

export function h2Names(root: MarkdownNode): string[] {
  const names: string[] = []
  for (const node of root.children ?? []) {
    if (node.type === 'heading' && node.depth === 2)
      names.push(visibleText(node).trim().toLowerCase())
  }
  return names
}
