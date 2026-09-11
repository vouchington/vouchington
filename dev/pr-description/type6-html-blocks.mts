import { blankLineRanges, htmlBlockLineRangesMatching } from './html-block-line-ranges.mts'

// CommonMark's raw-HTML-block type 6 recognizes an opening or closing tag for this fixed list of
// block-level element names at block-start (its sibling type 7 covers every other tag name, but only
// when nothing else shares its line and it isn't interrupting a paragraph — type 6 has neither
// restriction). Unlike type 1's tag-specific closer search, type 6 simply ends at the next blank line
// (or end of input), never at a matching closing tag — a `<div>` this search never finds a `</div>`
// for still ends its block the moment a blank line appears. It disables inline Markdown processing
// for every line it spans exactly like type 1 does, so a `Refs #N` line wrapped in one is displayed
// only as text and never forms a genuine GitHub cross-reference — even though the block (e.g. an
// image centered in a `<div>`) still renders visibly, the same visible-but-non-reprocessed gap type 1
// already closes for `<pre>`/`<textarea>` above.
const TYPE6_TAG_NAMES =
  'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|' +
  'dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|' +
  'hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|' +
  'section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul'
export const TYPE6_TAG_RE = new RegExp(`^ {0,3}</?(?:${TYPE6_TAG_NAMES})(?:[\\s>]|/>|$)`, 'i')

/**
 * Blanks every line spanned by a block-level type-6 raw HTML block (never a mid-line inline
 * occurrence of the same tag, which hides nothing) — see the constant comment above for why these
 * never form a genuine GitHub cross-reference despite staying visible on the rendered page.
 */
export function stripType6RawHtmlBlocks(body: string): string[] {
  return blankLineRanges(
    body,
    htmlBlockLineRangesMatching(body, value => TYPE6_TAG_RE.test(value)),
  )
}
