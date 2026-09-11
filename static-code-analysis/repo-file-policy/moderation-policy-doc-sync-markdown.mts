import {
  extractLooseMarkdownTableRows,
  extractMarkdownTables,
  markdownNodeText,
  markdownSectionBetweenHeadings,
  parseGfmMarkdown,
  walkMarkdown,
  type MarkdownNode,
  type PositionedMarkdownTable,
} from 'vouchington-tooling/markdown'

export function extractTableRowCells(section: string): string[][] {
  const tables = extractMarkdownTables(parseGfmMarkdown(section))
  return [
    ...tables.flatMap(table => table.rows.map(row => row.cells.map(normalizePolicyMatrixCell))),
    ...extractPipeRowsOutsideRanges(
      section,
      tables.flatMap(({ position }) => (position ? [position] : [])),
    ),
  ]
}

function extractPipeRowsOutsideRanges(
  section: string,
  ranges: ReadonlyArray<NonNullable<PositionedMarkdownTable['position']>>,
): string[][] {
  return extractLooseMarkdownTableRows(section, {
    excludePositions: ranges,
  }).map(row => row.cells.map(normalizePolicyMatrixCell))
}

export function extractFirstColumnTokens(section: string): string[] {
  const tables = extractMarkdownTables(parseGfmMarkdown(section))
  const ranges = tables.flatMap(({ position }) => (position ? [position] : []))
  return [
    ...tables.flatMap(table =>
      table.rows.map(row => normalizePolicyMatrixCell(row.cells[0] ?? '')),
    ),
    ...extractPipeRowsOutsideRanges(section, ranges).map(cells => cells[0] ?? ''),
  ].flatMap(firstCell => {
    const normalized = normalizePolicyMatrixCell(firstCell)
    return /^[a-z_]+$/.test(normalized) ? [normalized] : []
  })
}

export function findTableCells(section: string, firstCellText: string): string[] | null {
  return extractTableRowCells(section).find(cells => cells[0] === firstCellText) ?? null
}

export function extractInlineCodeTokens(node: MarkdownNode | undefined): string[] {
  const tokens: string[] = []
  if (!node) return tokens
  walkMarkdown(node, child => {
    if (child.type !== 'inlineCode') return
    if (typeof child.value !== 'string') return
    if (!/^[a-z_]+$/.test(child.value)) return
    tokens.push(child.value)
  })
  return tokens
}

export function extractInlineCodeTokensFromText(section: string): string[] {
  return [...section.matchAll(/`([a-z_]+)`/g)].map(match => match[1])
}

export function extractQuotedUnionTokens(line: string): string[] {
  return [...line.matchAll(/"([A-Za-z_]+)"/g)].flatMap(match => {
    const token = match[1]
    return token === 'entityType' || token === 'reason' ? [] : [token]
  })
}

export function sectionBetween(content: string, start: string, end: string): string {
  const startIndex = content.indexOf(start)
  if (startIndex === -1) return ''
  const bodyStart = startIndex + start.length
  const endIndex = content.indexOf(end, bodyStart)
  return content.slice(bodyStart, endIndex === -1 ? undefined : endIndex)
}

export function sectionAfter(content: string, start: string): string {
  const startIndex = content.indexOf(start)
  return startIndex === -1 ? '' : content.slice(startIndex + start.length)
}

export function normalizeMarkdownText(node: MarkdownNode | null | undefined): string {
  return node ? markdownNodeText(node, { whitespace: 'collapse' }).trim() : ''
}

const BARE_TOKEN_PATTERN =
  /\b[a-z]+(?:_[a-z]+)+\b|\b(?:post|comment|user|spam|harassment|misinformation|other)\b/g

export function extractBareTokenList(section: string): string[] {
  const tokens = [...section.matchAll(BARE_TOKEN_PATTERN)].map(match => match[0])
  if (tokens.length === 0) return []
  const prose = section
    .replace(BARE_TOKEN_PATTERN, '')
    .replaceAll(/\b(?:and|or)\b/g, '')
    .replaceAll(/[`*,.;:\s/()\[\]"']/g, '')
  return prose === '' ? tokens : []
}

export function extractIdentifierTokens(cell: string): string[] {
  return [...cell.matchAll(/\b[a-z]+(?:_[a-z]+)*\b/g)].map(match => match[0])
}

export function normalizePolicyMatrixCell(cell: string): string {
  return cell.trim().replaceAll('`', '').replaceAll('&check;', '✓').replaceAll('✅', '✓')
}

export function sectionBetweenHeadings(content: string, start: string, end: string): string {
  return markdownSectionBetweenHeadings(content, start, end)?.content ?? ''
}

export function sectionBetweenHeadingTexts(content: string, start: string, end: string): string {
  return markdownSectionBetweenHeadings(content, start, end, { endBoundary: 'any' })?.content ?? ''
}

export function lineMatching(content: string, pattern: string): string {
  return content.split('\n').find(line => line.includes(pattern)) ?? ''
}
