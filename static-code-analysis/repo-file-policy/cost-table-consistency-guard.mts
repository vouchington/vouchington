import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { parseMarkdownTables, type MarkdownTableRow } from 'vouchington-tooling/markdown'
import {
  CANONICAL_COST_DOCS,
  COST_SUMMARY_DOCS,
  discoverNoncanonicalDeploymentCostLeaves,
  hasCostTableGuardAnchor,
  OLD_COST_DOC,
} from './cost-table-consistency-inventory.mts'

type CostRange = { min: number; max: number }

const stripMarkdown = (cell: string): string => cell.replace(/(?:\*\*|__|\*|_|`)/g, '').trim()

const isTotalRow = (row: MarkdownTableRow): boolean =>
  /^total\b/i.test(stripMarkdown(row.cells[0] ?? ''))

function validCostTableRows(
  file: string,
  header: MarkdownTableRow,
  rows: MarkdownTableRow[],
  errors: string[],
): MarkdownTableRow[] {
  const validRows: MarkdownTableRow[] = []
  for (const row of rows) {
    if (row.cells.length === header.cells.length) {
      validRows.push(row)
      continue
    }
    errors.push(
      `::error file=${file},line=${row.line}::${file}: malformed cost table row; expected ${header.cells.length} columns but found ${row.cells.length}`,
    )
  }
  return validRows
}

function extractScenarioKeys(totalCell: string): string[] {
  const normalized = stripMarkdown(totalCell).toLowerCase()
  const keys = ['staging', 'production'].filter(key => normalized.includes(key))
  return keys.length > 0 ? keys : ['total']
}

function addRange(left: CostRange, right: CostRange): CostRange {
  return { min: left.min + right.min, max: left.max + right.max }
}

function parseCostCell(cell: string, scenarioKeys: string[]): Map<string, CostRange> {
  const ranges = new Map<string, CostRange>()
  const normalizedCell = stripMarkdown(cell).replaceAll('–', '-').replaceAll(',', '')
  if (!normalizedCell.includes('$') || /usage-metered/i.test(normalizedCell)) return ranges

  for (const segment of normalizedCell.split(/\s+\/\s+/)) {
    const match = segment.match(/(?:~|<)?\$(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/)
    if (!match) continue

    const isLessThan = match[0].startsWith('<')
    const min = isLessThan ? 0 : Number(match[1])
    const max = Number(match[2] ?? match[1])
    const lowerSegment = segment.toLowerCase()
    const segmentKeys = scenarioKeys.filter(key => key !== 'total' && lowerSegment.includes(key))
    const targetKeys = segmentKeys.length > 0 ? segmentKeys : scenarioKeys

    for (const key of targetKeys) {
      ranges.set(key, addRange(ranges.get(key) ?? { min: 0, max: 0 }, { min, max }))
    }
  }

  return ranges
}

const formatRange = (range: CostRange): string =>
  range.min === range.max ? `$${range.min}` : `$${range.min}-${range.max}`

function validateCanonicalCostTable(repoRoot: string, file: string, errors: string[]): void {
  const filePath = join(repoRoot, file)
  if (!existsSync(filePath)) {
    errors.push(
      `::error file=${file}::${file}: canonical cost table is tracked but missing or unreadable`,
    )
    return
  }

  let content: string
  try {
    content = readFileSync(filePath, 'utf8')
  } catch {
    errors.push(
      `::error file=${file}::${file}: canonical cost table is tracked but missing or unreadable`,
    )
    return
  }

  let foundCostTable = false
  for (const table of parseMarkdownTables(content)) {
    const [header, ...rows] = table
    if (!header || !rows.some(isTotalRow)) continue
    foundCostTable = true
    const validRows = validCostTableRows(file, header, rows, errors)
    if (validRows.length !== rows.length) continue
    const totalRow = validRows.find(isTotalRow)
    if (!totalRow) continue

    const estimateColumn = header.cells.length - 1
    const totalCell = totalRow.cells[estimateColumn] ?? ''
    const scenarioKeys = extractScenarioKeys(totalCell)
    const expectedByScenario = new Map(scenarioKeys.map(key => [key, { min: 0, max: 0 }]))

    for (const row of validRows) {
      if (isTotalRow(row)) continue
      const ranges = parseCostCell(row.cells[estimateColumn] ?? '', scenarioKeys)
      for (const [key, range] of ranges) {
        expectedByScenario.set(
          key,
          addRange(expectedByScenario.get(key) ?? { min: 0, max: 0 }, range),
        )
      }
    }

    const actualByScenario = parseCostCell(totalCell, scenarioKeys)
    for (const key of scenarioKeys) {
      const expected = expectedByScenario.get(key) ?? { min: 0, max: 0 }
      const actual = actualByScenario.get(key)
      if (actual && actual.min === expected.min && actual.max === expected.max) continue
      const label = key === 'total' ? 'total' : `${key} total`
      errors.push(
        `::error file=${file},line=${header.line}::${file}: cost table ${label} mismatch; expected ${formatRange(expected)} from rows but found ${actual ? formatRange(actual) : 'no parseable total'}`,
      )
    }
  }

  if (!foundCostTable)
    errors.push(`::error file=${file}::${file}: canonical cost table must contain a Total row`)
}

function validateCostSummaryDoc(
  repoRoot: string,
  file: string,
  requiredLink: string | undefined,
  errors: string[],
): void {
  const filePath = join(repoRoot, file)
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return

  const content = readFileSync(filePath, 'utf8')
  if (requiredLink && !content.includes(requiredLink)) {
    errors.push(
      `::error file=${file}::${file}: link to canonical cost doc (${requiredLink}) is required`,
    )
  }

  for (const table of parseMarkdownTables(content)) {
    const [header, ...rows] = table
    if (!header) continue
    const hasCopiedTotalRow = rows.some(
      row => isTotalRow(row) && row.cells.some(cell => cell.includes('$')),
    )
    if (!hasCopiedTotalRow) continue
    void validCostTableRows(file, header, rows, errors)
    errors.push(
      `::error file=${file},line=${header.line}::${file}: do not duplicate cost-total tables outside canonical cost table leaves`,
    )
  }
}

export function checkCostTableConsistencyGuard(
  repoRoot: string,
  trackedFiles: readonly string[],
  errors: string[],
): void {
  const trackedFileSet = new Set(trackedFiles)
  const noncanonicalCostLeaves = discoverNoncanonicalDeploymentCostLeaves(trackedFiles)
  if (!hasCostTableGuardAnchor(trackedFiles, noncanonicalCostLeaves)) return

  for (const file of CANONICAL_COST_DOCS) {
    if (!trackedFileSet.has(file)) {
      errors.push(`::error file=${file}::${file}: canonical cost table must be tracked`)
      continue
    }
    validateCanonicalCostTable(repoRoot, file, errors)
  }

  for (const [file, requiredLink] of COST_SUMMARY_DOCS) {
    if (!trackedFileSet.has(file)) continue
    validateCostSummaryDoc(repoRoot, file, requiredLink, errors)
  }

  if (trackedFileSet.has(OLD_COST_DOC))
    validateCostSummaryDoc(repoRoot, OLD_COST_DOC, undefined, errors)

  for (const file of noncanonicalCostLeaves)
    validateCostSummaryDoc(repoRoot, file, undefined, errors)
}
