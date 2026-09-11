import { blankLineRanges, htmlBlockLineRangesMatching } from './html-block-line-ranges.mts'
import { TYPE1_TAG_RE } from './type1-html-blocks.mts'
import { TYPE6_TAG_RE } from './type6-html-blocks.mts'

// CommonMark's raw-HTML-block type 7 covers every tag name not already claimed by type 1
// (script/style/pre/textarea) or type 6 (the fixed block-tag list) — e.g. <span>. Its start
// condition is stricter than type 6's: the complete open or closing tag must be alone on its own
// line (only trailing whitespace permitted after it) and it cannot interrupt a paragraph. Neither
// restriction needs reimplementing here — remark/micromark already applies both when deciding
// whether a line becomes an `html` block node at all, so any block-level `html` node whose value
// isn't a type-1 or type-6 tag opener is, by construction, a type-7 node. Like type 6 (and unlike
// type 1), it ends at the next blank line, never at a matching closing tag. It disables inline
// Markdown processing for every line it spans exactly like types 1 and 6 do, so a `Refs #N` line
// alone on its own line inside one (e.g. a lone `<span>`) is displayed only as text and never
// forms a genuine GitHub cross-reference. Content sharing a line with the tag (e.g.
// `<span>Refs #456</span>`) fails type 7's alone-on-its-own-line start condition, so that line
// never becomes a block at all — it stays ordinary inline HTML, still subject to normal inline
// processing, and must not be blanked here.
const HTML_TAG_OPEN_RE = /^ {0,3}<\/?[A-Za-z][A-Za-z0-9-]*(?:[\s>]|\/>|$)/

function isType7Block(value: string): boolean {
  return HTML_TAG_OPEN_RE.test(value) && !TYPE1_TAG_RE.test(value) && !TYPE6_TAG_RE.test(value)
}

/**
 * Blanks every line spanned by a block-level type-7 raw HTML block (any tag name other than type
 * 1's or type 6's, alone on its own line) — never a same-line or mid-line occurrence, which hides
 * nothing (see the constant comment above).
 */
export function stripType7RawHtmlBlocks(body: string): string[] {
  return blankLineRanges(body, htmlBlockLineRangesMatching(body, isType7Block))
}
