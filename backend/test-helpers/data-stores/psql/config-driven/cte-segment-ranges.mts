export interface TextRange {
  start: number
  end: number
}

const CTE_HEADER =
  /^\s*[A-Za-z_][\w$]*\s*(?:\([^()]*\)\s*)?AS\s*(?:MATERIALIZED\s+|NOT\s+MATERIALIZED\s+)?\(/i

/**
 * Splits a masked `WITH a AS (...), b AS (...) <final statement>` into one range per
 * CTE body plus the trailing final statement, tracking paren depth to find each CTE's
 * matching close paren. Falls back to the whole text as a single range when there is
 * no top-level WITH, or the CTE list doesn't match this shape.
 *
 * Expects `text` to have already passed through `maskSqlLiterals` so that parens and
 * keywords inside string literals cannot be mistaken for CTE structure; the returned
 * ranges are offsets into that same masked text, which `maskSqlLiterals` guarantees
 * stay index-aligned with the original unmasked source.
 */
export function splitCteSegmentRanges(text: string): TextRange[] {
  const withMatch = /^\s*WITH\s+(?:RECURSIVE\s+)?/i.exec(text)
  if (!withMatch) return [{ start: 0, end: text.length }]

  const ranges: TextRange[] = []
  let index = withMatch[0].length
  while (index < text.length) {
    const header = CTE_HEADER.exec(text.slice(index))
    if (!header) return [{ start: 0, end: text.length }]

    const bodyOpen = index + header[0].length - 1
    const bodyClose = findMatchingParen(text, bodyOpen)
    if (bodyClose === -1) return [{ start: 0, end: text.length }]

    ranges.push({ start: bodyOpen + 1, end: bodyClose })
    index = bodyClose + 1

    const comma = /^\s*,\s*/.exec(text.slice(index))
    if (!comma) break
    index += comma[0].length
  }

  ranges.push({ start: index, end: text.length })
  return ranges
}

function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return i
  }
  return -1
}
