/* oxlint-disable no-restricted-imports -- PR lifecycle validation needs a GFM parser */
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

export function hasUncheckedGitHubTask(markdown: string | undefined): boolean {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(markdown ?? '')
  const nodes: Array<{ checked?: boolean | null; children?: unknown[]; type?: string }> = [tree]
  while (nodes.length > 0) {
    const node = nodes.pop()
    if (node?.type === 'listItem' && node.checked === false) return true
    for (const child of node?.children ?? []) {
      if (typeof child === 'object' && child !== null) nodes.push(child)
    }
  }
  return false
}
