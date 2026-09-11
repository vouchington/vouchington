import { blankLineRanges, htmlBlockLineRangesMatching } from './html-block-line-ranges.mts'

// CommonMark's raw-HTML-block type 1 (`<script>`, `<pre>`, `<style>`, `<textarea>`) matches its
// opening and closing tag names case-insensitively and independently of each other (`<SCRIPT>` closed
// by `</Script>` is one block), swallows every line up to and including the one containing its closer
// — even trailing text after the closer on that same line — and, when never closed, runs to the end of
// the document rather than stopping at a blank line. A type-1 block also disables all further inline
// Markdown processing (including `#N` autolinking) for every line it spans: GitHub's sanitizer strips
// `<script>`/`<style>` and their contents entirely from rendered output, so those are invisible to a
// reviewer, while `<pre>`/`<textarea>` remain visible as ordinary rendered text — but none of the four
// forms a genuine GitHub cross-reference, since raw-HTML-block content is never reprocessed as inline
// Markdown. sanitizedLines()'s callers (dev/pr-description/scheduled-no-source.mts) need "would this
// line participate in real GitHub reference resolution," not "is this visible to a human reviewer," so
// all four tags are blanked here.
export const TYPE1_TAG_RE = /^ {0,3}<(script|style|pre|textarea)(?:[\s>]|$)/i

/**
 * Blanks every line spanned by a block-level `<script>`, `<style>`, `<pre>`, or `<textarea>` raw HTML
 * block (never a mid-line inline occurrence of any of these tags, which hides nothing): none of the
 * four ever forms a genuine GitHub cross-reference, even though `<pre>`/`<textarea>` stay visible on
 * the rendered page while `<script>`/`<style>` are stripped outright.
 */
export function stripType1RawHtmlBlocks(body: string): string[] {
  return blankLineRanges(
    body,
    htmlBlockLineRangesMatching(body, value => TYPE1_TAG_RE.test(value)),
  )
}
