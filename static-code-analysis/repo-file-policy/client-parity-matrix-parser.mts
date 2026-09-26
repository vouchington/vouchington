import { parseMarkdownTables } from 'vouchington-tooling/markdown'
import {
  parseIssueLinkDefinitions,
  ISSUE_REF_RE,
  type IssueLinkDefinition,
} from './client-parity-matrix-references.mts'
import {
  matrixContent,
  matrixSourceAtLine,
  type ClientParityMatrixInput,
  type MatrixSourceLocation,
} from './client-parity-matrix-source.mts'
import { statusFromMatrixCell, type ClientFeatureStatus } from './client-parity-status.mts'
import {
  classifyTableKind,
  statusFromTableRow,
  type TableKind,
} from './client-parity-matrix-table-kind.mts'

const CLOSED_BY_LIST_RE = /closed by\s+((?:\[#\d+\](?:\s*(?:,|and)\s*)?)+)/gi
const OPEN_ARROW_RE = /→\s*\[#(\d+)\]/g
const CURRENT_STATE_CLOSED_RE = /^(closed by|closed\b)/i

export type { TableKind } from './client-parity-matrix-table-kind.mts'
export type StatusKind = ClientFeatureStatus
export type { IssueLinkDefinition }

export interface ParsedMatrixRow extends MatrixSourceLocation {
  tableKind: TableKind
  surfaceKey: string
  text: string
  issueIds: Set<string>
  closedByIssueIds: Set<string>
  openArrowIssueIds: Set<string>
  trackingIssueIds: Set<string>
  statusKind?: StatusKind
  webStatus?: StatusKind
  swiftStatus?: StatusKind
  dotnetStatus?: StatusKind
  clients?: string
}

function normalizeCell(text: string): string {
  return text.trim()
}

function clientStatuses(
  kind: TableKind,
  cells: string[],
): Pick<ParsedMatrixRow, 'webStatus' | 'swiftStatus' | 'dotnetStatus'> {
  if (kind === 'C') return {}
  const offset = kind === 'A' ? 1 : 2
  return {
    webStatus: statusFromMatrixCell(cells[offset] ?? ''),
    swiftStatus: statusFromMatrixCell(cells[offset + 1] ?? ''),
    dotnetStatus: statusFromMatrixCell(cells[offset + 2] ?? ''),
  }
}

function hasExpectedCellCount(kind: TableKind, cells: string[]): boolean {
  return cells.length === (kind === 'A' ? 5 : kind === 'B' ? 6 : 7)
}

function issueIdsFrom(text: string, pattern: RegExp): Set<string> {
  return new Set([...text.matchAll(pattern)].flatMap(match => (match[1] ? [match[1]] : [])))
}

function closedByIssueIdsFrom(text: string): Set<string> {
  const issueIds = new Set<string>()
  for (const match of text.matchAll(CLOSED_BY_LIST_RE)) {
    for (const issueId of issueIdsFrom(match[1] ?? '', ISSUE_REF_RE)) issueIds.add(issueId)
  }
  return issueIds
}

function surfaceKeyFor(kind: TableKind, cells: string[]): string {
  const cell = kind === 'A' ? cells[0] : kind === 'B' ? cells[1] : cells[2]
  return normalizeCell(cell ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function tableCClosedIssueIds(cells: string[], text: string): Set<string> {
  return new Set([...issueIdsFrom(cells[6] ?? '', ISSUE_REF_RE), ...closedByIssueIdsFrom(text)])
}

function parseRows(input: ClientParityMatrixInput): ParsedMatrixRow[] {
  const rows: ParsedMatrixRow[] = []
  for (const table of parseMarkdownTables(matrixContent(input))) {
    const kind = classifyTableKind(table[0]?.cells ?? [])
    if (!kind) continue
    for (const row of table.slice(1)) {
      if (row.cells.every(cell => cell.length === 0) || !hasExpectedCellCount(kind, row.cells))
        continue
      const text = row.cells.join(' ')
      const location = matrixSourceAtLine(input, row.line)
      rows.push({
        ...location,
        tableKind: kind,
        surfaceKey: surfaceKeyFor(kind, row.cells),
        text,
        issueIds: issueIdsFrom(text, ISSUE_REF_RE),
        closedByIssueIds:
          kind === 'C' && CURRENT_STATE_CLOSED_RE.test(normalizeCell(row.cells[4] ?? ''))
            ? tableCClosedIssueIds(row.cells, text)
            : closedByIssueIdsFrom(text),
        openArrowIssueIds: issueIdsFrom(text, OPEN_ARROW_RE),
        trackingIssueIds: kind === 'C' ? issueIdsFrom(row.cells[6] ?? '', ISSUE_REF_RE) : new Set(),
        statusKind: statusFromTableRow(kind, row.cells),
        ...(kind === 'C' ? { clients: row.cells[3] } : {}),
        ...clientStatuses(kind, row.cells),
      })
    }
  }
  return rows
}

export function parseClientParityMatrix(input: ClientParityMatrixInput): {
  issueLinkDefinitions: IssueLinkDefinition[]
  rows: ParsedMatrixRow[]
} {
  return {
    issueLinkDefinitions: parseIssueLinkDefinitions(input),
    rows: parseRows(input),
  }
}
