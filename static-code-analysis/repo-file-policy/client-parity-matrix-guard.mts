import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { readCanonicalMarkdownChildren } from './canonical-markdown-children.mts'
import { parseClientParityMatrix, type ParsedMatrixRow } from './client-parity-matrix-parser.mts'
import type { MatrixSourceLocation } from './client-parity-matrix-source.mts'

const CLIENT_PARITY_MATRIX_DOC = 'docs/requirements/CLIENT-PARITY-MATRIX.md'

const RESIDUAL_GAP_RE =
  /\b(?:remain(?:s|ing)?|still|missing|absent|placeholder|read-only|read only|web-only|web only|not exposed|external fallback|fallback|no pending state|catalog placeholder|unavailable)\b/i

function error(errors: string[], source: MatrixSourceLocation, message: string): void {
  const file = source.file ?? CLIENT_PARITY_MATRIX_DOC
  errors.push(`::error file=${file},line=${source.line}::${file}: ${message}`)
}

function hasResidualGapLanguage(row: ParsedMatrixRow): boolean {
  return RESIDUAL_GAP_RE.test(row.text)
}

function issueLabel(issueIds: Iterable<string>): string {
  const ids = [...issueIds].map(issueId => `[#${issueId}]`)
  if (ids.length <= 2) return ids.join(' and ')
  return `${ids.slice(0, -1).join(', ')}, and ${ids.at(-1)}`
}

function rowsBySurfaceKey(rows: ParsedMatrixRow[]): Map<string, ParsedMatrixRow[]> {
  const bySurface = new Map<string, ParsedMatrixRow[]>()
  for (const row of rows) {
    if (!row.surfaceKey) continue
    const key = `${row.tableKind}:${row.surfaceKey}`
    const bucket = bySurface.get(key)
    if (bucket) bucket.push(row)
    else bySurface.set(key, [row])
  }
  return bySurface
}

export function checkClientParityMatrixGuard(
  repoRoot: string,
  trackedFiles: readonly string[],
  errors: string[],
): void {
  if (!trackedFiles.includes(CLIENT_PARITY_MATRIX_DOC)) return

  const filePath = join(repoRoot, CLIENT_PARITY_MATRIX_DOC)
  if (!existsSync(filePath)) return

  const composition = readCanonicalMarkdownChildren(
    repoRoot,
    CLIENT_PARITY_MATRIX_DOC,
    readFileSync(filePath, 'utf8'),
    trackedFiles,
    new Map(),
    errors,
  )
  const { issueLinkDefinitions, rows } = parseClientParityMatrix(composition)
  if (rows.length === 0) return

  for (const definition of issueLinkDefinitions)
    error(
      errors,
      definition,
      `archival issue reference [#${definition.issueId}] must remain plain text; remove its link definition`,
    )

  for (const row of rows) {
    if (
      (row.tableKind === 'A' || row.tableKind === 'B') &&
      (!row.webStatus || !row.swiftStatus || !row.dotnetStatus)
    ) {
      error(errors, row, 'summary row contains a blank or unknown client status')
    }
    if (row.tableKind === 'C' && row.statusKind === 'full') {
      error(errors, row, 'Table C must contain active gaps only; remove closed history')
    }
    if (row.tableKind === 'C' && row.statusKind === undefined) {
      error(
        errors,
        row,
        'active gap Current state must begin with None, Plumb, Present, Read-only, or Partial',
      )
    }
    if (row.tableKind === 'C' && row.clients !== 'Swift + .NET') {
      error(errors, row, 'active gap Client(s) must be exactly "Swift + .NET"')
    }
  }

  const closedByIssueIds = new Set(rows.flatMap(row => [...row.closedByIssueIds]))
  for (const row of rows) {
    if (
      row.statusKind === undefined ||
      row.statusKind === 'full' ||
      row.closedByIssueIds.size === 0 ||
      hasResidualGapLanguage(row)
    )
      continue
    error(
      errors,
      row,
      `row stays ${row.statusKind} but issue ${issueLabel(row.closedByIssueIds)} is cited as closed; name the remaining gap explicitly`,
    )
  }

  for (const [surfaceKey, surfaceRows] of rowsBySurfaceKey(rows)) {
    if (!surfaceRows.some(row => row.statusKind === 'full')) continue
    for (const row of surfaceRows) {
      if (row.statusKind === undefined || row.statusKind === 'full') continue
      error(
        errors,
        row,
        `surface "${surfaceKey}" is marked full elsewhere but this row stays ${row.statusKind}`,
      )
    }
  }

  for (const row of rows) {
    for (const issueId of row.openArrowIssueIds) {
      if (closedByIssueIds.has(issueId)) {
        error(
          errors,
          row,
          `open arrow [#${issueId}] is stale because another row closes the same issue`,
        )
      }
    }
  }
}
