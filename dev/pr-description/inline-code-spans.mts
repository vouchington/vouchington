/* oxlint-disable no-restricted-imports -- detecting a code span whose backtick delimiters sit on
   separate lines needs a real GFM parser; regex/anchor matching alone can't see across the join. */
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

// A code span's opening and closing backtick runs may sit on separate lines within the same
// paragraph — CommonMark converts the intervening line endings to spaces, collapsing everything
// between into one literal, non-autolinked run of inline code. Unlike the raw-HTML-block forms in
// sanitized-lines.mts, a code span's boundaries never diverge from what a real GFM parser reports
// (there is no browser-tokenizer-keeps-swallowing-across-blocks hazard), so parsing is the reliable
// way to find them — a same-line span is already caught incidentally by the exact-line anchors in
// scheduled-no-source.mts, but a multi-line one leaves its inner lines byte-for-byte unchanged and
// must be blanked here instead.
const inlineCodeSpanParser = unified().use(remarkParse).use(remarkGfm)

function inlineCodeLineRanges(body: string): Array<{ end: number; start: number }> {
  const tree = inlineCodeSpanParser.parse(body)
  const ranges: Array<{ end: number; start: number }> = []
  const nodes: Array<{
    children?: unknown[]
    position?: { end: { line: number }; start: { line: number } }
    type?: string
  }> = [tree]

  while (nodes.length > 0) {
    const node = nodes.pop()
    if (node?.type === 'inlineCode' && node.position !== undefined) {
      ranges.push({ start: node.position.start.line, end: node.position.end.line })
    }
    for (const child of node?.children ?? []) {
      if (typeof child === 'object' && child !== null) nodes.push(child)
    }
  }

  return ranges
}

/**
 * Blanks every line spanned by an inline code span (start line through end line, inclusive), since
 * their content renders as literal code text on GitHub, never a live cross-reference or the exact
 * marker text these validations look for.
 */
export function stripInlineCodeSpans(body: string): string[] {
  const lines = body.split(/\r?\n/)

  for (const range of inlineCodeLineRanges(body)) {
    for (let lineNumber = range.start; lineNumber <= range.end; lineNumber += 1) {
      lines[lineNumber - 1] = ''
    }
  }

  return lines
}
