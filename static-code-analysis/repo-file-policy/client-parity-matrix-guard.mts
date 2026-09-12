import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { readCanonicalMarkdownChildren } from './canonical-markdown-children.mts'
import {
  parseClientParityMatrix,
  type IssueDefinition,
  type ParsedMatrixRow,
} from './client-parity-matrix-parser.mts'
import type { MatrixSourceLocation } from './client-parity-matrix-source.mts'

const CLIENT_PARITY_MATRIX_DOC = 'docs/requirements/CLIENT-PARITY-MATRIX.md'

/**
 * Where the issues the parity matrix cites actually live. This is deliberately not this
 * repository: the matrix references issue numbers, and those issues have not been migrated out of
 * `jonathanong/filaments` yet. Retarget this constant and the link-reference definitions in
 * `docs/requirements/reference-client-parity-matrix-table-*.md` in the same change — the
 * definitions resolve to real issues only while the two agree.
 */
const PARITY_MATRIX_ISSUE_TRACKER = { owner: 'jonathanong', repository: 'filaments' } as const

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

function definitionsMatch(left: IssueDefinition, right: IssueDefinition): boolean {
  return (
    left.protocol === right.protocol &&
    left.owner === right.owner &&
    left.repository === right.repository &&
    left.urlIssueId === right.urlIssueId
  )
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
  const { definitions, referencedIssueIds, referencedIssueLocations, rows } =
    parseClientParityMatrix(composition)
  if (rows.length === 0) return

  const definitionById = new Map<string, IssueDefinition>()
  for (const definition of definitions) {
    const existing = definitionById.get(definition.issueId)
    if (existing) {
      if (existing.file === definition.file || !definitionsMatch(existing, definition)) {
        error(errors, definition, `duplicate issue definition [#${definition.issueId}]`)
      }
    } else definitionById.set(definition.issueId, definition)
    if (definition.protocol !== 'https') {
      error(
        errors,
        definition,
        `issue definition [#${definition.issueId}] must use canonical HTTPS`,
      )
    }
    if (
      definition.owner !== PARITY_MATRIX_ISSUE_TRACKER.owner ||
      definition.repository !== PARITY_MATRIX_ISSUE_TRACKER.repository
    ) {
      error(
        errors,
        definition,
        `issue definition [#${definition.issueId}] must target ${PARITY_MATRIX_ISSUE_TRACKER.owner}/${PARITY_MATRIX_ISSUE_TRACKER.repository}`,
      )
    }
    if (definition.issueId !== definition.urlIssueId) {
      error(
        errors,
        definition,
        `issue definition [#${definition.issueId}] URL targets issue #${definition.urlIssueId}`,
      )
    }
  }

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

  for (const issueId of [...referencedIssueIds].toSorted(
    (left, right) => Number(left) - Number(right),
  )) {
    if (definitionById.has(issueId)) continue
    error(
      errors,
      referencedIssueLocations.get(issueId) ?? { line: 1 },
      `issue reference [#${issueId}] is used but missing a footer definition`,
    )
  }

  for (const definition of definitions) {
    if (referencedIssueIds.has(definition.issueId)) continue
    error(errors, definition, `issue definition [#${definition.issueId}] is unused`)
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
