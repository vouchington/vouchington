/* oxlint-disable no-restricted-imports -- distinguishing a genuine block-level raw HTML block (which
   swallows every line up to its closer or the next blank line) from the same tag appearing mid-line
   as ordinary inline HTML (which swallows nothing) needs a real parse tree, not regex/anchor
   matching. Shared by every raw-HTML-block type that needs this distinction (see type1-html-blocks.mts
   and type6-html-blocks.mts) so each caller only supplies its own tag-matching predicate. */
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

// The exact same `html` node type is used for a mid-line inline tag (e.g. prose containing a literal
// `<script>` or `<div>`), which never hides surrounding content — CommonMark still parses the text
// around it as ordinary visible text nodes. Such a node is a child of a phrasing container (a
// paragraph, here) and must never be walked into; only a container that can hold sibling BLOCK nodes
// can hold a genuine block-level raw HTML block, so recursion is limited to those.
const BLOCK_CONTAINER_TYPES = new Set(['root', 'blockquote', 'list', 'listItem'])

const htmlBlockParser = unified().use(remarkParse).use(remarkGfm)

/**
 * Returns the 1-indexed, inclusive line ranges of every block-level raw HTML block in `body` whose
 * raw text satisfies `isTargetBlock` — never a mid-line inline occurrence of the same markup.
 */
export function htmlBlockLineRangesMatching(
  body: string,
  isTargetBlock: (value: string) => boolean,
): Array<{ end: number; start: number }> {
  const tree = htmlBlockParser.parse(body)
  const ranges: Array<{ end: number; start: number }> = []
  const containers: Array<{ children?: unknown[] }> = [tree]

  while (containers.length > 0) {
    const container = containers.pop()
    for (const child of container?.children ?? []) {
      if (typeof child !== 'object' || child === null) continue
      const node = child as {
        position?: { end: { line: number }; start: { line: number } }
        type?: string
        value?: string
      }

      if (
        node.type === 'html' &&
        node.value !== undefined &&
        node.position !== undefined &&
        isTargetBlock(node.value)
      ) {
        ranges.push({ start: node.position.start.line, end: node.position.end.line })
      } else if (typeof node.type === 'string' && BLOCK_CONTAINER_TYPES.has(node.type)) {
        containers.push(node as { children?: unknown[] })
      }
    }
  }

  return ranges
}

/** Blanks every line covered by `ranges` (1-indexed, inclusive) in `body`. */
export function blankLineRanges(
  body: string,
  ranges: Array<{ end: number; start: number }>,
): string[] {
  const lines = body.split(/\r?\n/)
  for (const range of ranges) {
    for (let lineNumber = range.start; lineNumber <= range.end; lineNumber += 1) {
      lines[lineNumber - 1] = ''
    }
  }

  return lines
}
