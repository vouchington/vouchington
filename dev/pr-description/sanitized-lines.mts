import { stripInlineCodeSpans } from './inline-code-spans.mts'
import { stripType1RawHtmlBlocks } from './type1-html-blocks.mts'
import { stripType6RawHtmlBlocks } from './type6-html-blocks.mts'
import { stripType7RawHtmlBlocks } from './type7-html-blocks.mts'

// CommonMark measures fence indentation in columns, with a tab advancing to the next multiple of
// four; from column 0 (every fence line starts a line) a single tab always lands on column 4 or
// later, already past the three-column budget regardless of any spaces around it. So the "up to
// three spaces" allowance admits literal space characters only, never a tab — counting a tab as
// one indent unit like a space under-counts its real column cost and would wrongly accept a
// tab-indented look-alike that CommonMark treats as code content, not a real fence boundary.
function isClosingFenceLine(line: string, fence: { character: string; length: number }): boolean {
  const closing = /^ {0,3}(?<rest>.*?)[ \t]*$/.exec(line)?.groups?.rest ?? ''
  return (
    closing.length >= fence.length && [...closing].every(candidate => candidate === fence.character)
  )
}

function unfencedLines(body: string): string[] {
  const lines: string[] = []
  let fence: { character: string; length: number } | undefined

  for (const line of body.split(/\r?\n/)) {
    if (fence === undefined) {
      const opening = /^ {0,3}(?<fence>`{3,}|~{3,})/.exec(line)?.groups?.fence
      if (opening === undefined) {
        lines.push(line)
      } else {
        lines.push('')
        fence = { character: opening[0], length: opening.length }
      }
      continue
    }

    if (isClosingFenceLine(line, fence)) {
      fence = undefined
    }
  }

  return lines
}

// A complete single-line comment (opens and closes on the same line, e.g. an exception's own
// marker) is left untouched: its rendered-invisible content is the marker text itself, which an
// exact-string marker check must still see. Only a comment that opens on one line and closes on a
// later one is stripped — that shape can hide an otherwise-visible line from GitHub's rendered
// output while leaving it exploitably present in these raw lines.
//
// A line can contain several delimiter pairs (e.g. `<!-- harmless --> <!--`): the trailing `<!--`
// reopens a real, unclosed comment even though an earlier one on the same line already closed. So
// this scans every delimiter on the line in order rather than stopping at the first `-->` found —
// otherwise that reopening, and everything hidden by it on later lines, would go undetected.
function stripHtmlComments(lines: string[]): string[] {
  const stripped: string[] = []
  let inComment = false

  for (const line of lines) {
    let hidden = inComment
    let index = 0

    for (;;) {
      if (inComment) {
        const closeIndex = line.indexOf('-->', index)
        if (closeIndex === -1) break
        inComment = false
        index = closeIndex + 3
        continue
      }

      const openIndex = line.indexOf('<!--', index)
      if (openIndex === -1) break
      const closeIndex = line.indexOf('-->', openIndex + 4)
      if (closeIndex === -1) {
        inComment = true
        hidden = true
        break
      }
      index = closeIndex + 3
    }

    stripped.push(hidden ? '' : line)
  }

  return stripped
}

// Beyond `<!-- -->` comments, CommonMark recognizes three more raw-HTML-block openers whose
// content GitHub renders invisibly wherever their own closer eventually appears — even across
// paragraphs CommonMark's own block boundaries treat as unrelated, the same cross-block reach
// stripHtmlComments already accounts for above. Unlike a comment, none of these forms doubles as
// this codebase's own marker mechanism, so there is no single-line exemption here: any occurrence,
// same-line-closed or not, is content a human reviewer never sees and must not read as visible
// prose. Handled elsewhere: `<script>`/`<style>`/`<pre>`/`<textarea>` blocks (stripType1RawHtmlBlocks,
// dev/pr-description/type1-html-blocks.mts), the bare block-tag forms like `<div>`
// (stripType6RawHtmlBlocks, dev/pr-description/type6-html-blocks.mts), and every other tag name alone
// on its own line like `<span>` (stripType7RawHtmlBlocks, dev/pr-description/type7-html-blocks.mts) —
// all three render their contents as ordinary *visible* HTML, but visible is not the criterion this
// file blanks for (see sanitizedLines below), so all three still get blanked despite staying on the
// rendered page.
// The declaration form's opener letter is case-insensitive in CommonMark — `<!doctype` starts a
// declaration block exactly like `<!DOCTYPE` — so this must not require uppercase.
const HIDDEN_HTML_OPENER_RE = /<!\[CDATA\[|<![A-Za-z]|<\?/g

function hiddenHtmlCloserFor(opener: string): string {
  if (opener === '<![CDATA[') return ']]>'
  return opener.startsWith('<?') ? '?>' : '>'
}

// CommonMark only starts one of these raw-HTML blocks when its opener sits at block-start (at most
// three leading spaces, nothing else before it) — never mid-line. A mid-line, non-block-start
// opener that never closes on its own line renders as ordinary escaped text, not a hidden block, so
// it must not be allowed to set activeCloser and blank every line that follows it.
function isBlockStartIndex(line: string, index: number): boolean {
  return index <= 3 && /^ *$/.test(line.slice(0, index))
}

function stripOtherRawHtmlBlocks(lines: string[]): string[] {
  const stripped: string[] = []
  let activeCloser: string | undefined

  for (const line of lines) {
    let hidden = activeCloser !== undefined
    let index = 0

    for (;;) {
      if (activeCloser !== undefined) {
        const closeIndex = line.indexOf(activeCloser, index)
        if (closeIndex === -1) break
        index = closeIndex + activeCloser.length
        activeCloser = undefined
        continue
      }

      HIDDEN_HTML_OPENER_RE.lastIndex = index
      const match = HIDDEN_HTML_OPENER_RE.exec(line)
      if (match === null) break

      const closer = hiddenHtmlCloserFor(match[0])
      const closeIndex = line.indexOf(closer, HIDDEN_HTML_OPENER_RE.lastIndex)
      if (closeIndex === -1) {
        if (isBlockStartIndex(line, match.index)) {
          hidden = true
          activeCloser = closer
        }
        break
      }

      hidden = true
      index = closeIndex + closer.length
    }

    stripped.push(hidden ? '' : line)
  }

  return stripped
}

// All four remark-based passes below must parse the pristine, untouched `body` — never each
// other's output — because blanking a line to '' changes what the next CommonMark parse would see
// (a blank line is a block boundary), which could shift the very structure being detected. Their
// results are merged by index instead of by re-parsing modified text.
function stripRemarkDetectedBlocks(body: string): string[] {
  const lines = stripType1RawHtmlBlocks(body)
  for (const [index, line] of stripType6RawHtmlBlocks(body).entries()) {
    if (line === '') lines[index] = ''
  }
  for (const [index, line] of stripType7RawHtmlBlocks(body).entries()) {
    if (line === '') lines[index] = ''
  }
  for (const [index, line] of stripInlineCodeSpans(body).entries()) {
    if (line === '') lines[index] = ''
  }
  return lines
}

/**
 * Turns a PR body into lines safe for structural (non-rendered) matching: fenced code block
 * interiors, multi-line inline code span interiors, `<script>`/`<style>`/`<pre>`/`<textarea>` block
 * interiors, type-6 bare block-tag interiors (e.g. `<div>`), type-7 other-tag-name interiors (e.g.
 * `<span>`, only when alone on its own line), multi-line HTML comment interiors, and the other
 * CommonMark raw-HTML-block forms that render invisibly (processing instructions, CDATA sections,
 * declarations) are blanked, so a line only "counts" for exact-line-shape validation (see
 * scheduled-no-source.mts) when it would both render as visible Markdown text AND participate in
 * real GitHub reference resolution — a raw HTML block disables the latter even for the tags
 * (`<pre>`/`<textarea>`/`<div>`/`<span>`/etc.) that keep the former.
 */
export function sanitizedLines(body: string): string[] {
  return stripOtherRawHtmlBlocks(
    stripHtmlComments(unfencedLines(stripRemarkDetectedBlocks(body).join('\n'))),
  )
}
