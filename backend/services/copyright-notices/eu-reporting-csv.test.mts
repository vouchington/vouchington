import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  DSA_REPORT_PART4_TEMPLATE,
  DSA_REPORT_PART7_TEMPLATE,
} from '@voucha/test-helpers/dsa-report-template-fixtures'
import type { DsaCopyrightTransparencyFigures } from './eu-reporting.mts'
import { renderEuCopyrightReportCsv } from './eu-reporting-csv.mts'

const report = {
  period_start: '2026-01-01T00:00:00.000Z',
  period_end: '2027-01-01T00:00:00.000Z',
  generated_at: '2027-01-02T00:00:00.000Z',
  receipt_count: 9,
  statement_of_reasons_count: 4,
  redress_request_count: 3,
  redress_decision_count: 2,
  supervised_complaint_count: 0,
  escalation_count: 0,
  notices_received_count: 9,
  notices_received_trusted_flagger_count: 2,
  notified_items_count: 12,
  notified_items_trusted_flagger_count: 3,
  actions_on_law_count: 5,
  actions_on_law_trusted_flagger_count: 1,
  actions_on_terms_count: 0,
  actions_on_terms_trusted_flagger_count: 0,
  median_hours_to_action: 4.25,
  median_hours_to_action_trusted_flagger: 2.5,
  notices_processed_by_automated_means_count: 6,
  restrictions_imposed_by_automated_means_count: 2,
  complaints_by_submitter: { notifier: 4, poster: 1, reviewer: 0 },
  complaints_by_decision_type: {
    restrict: { received: 3, upheld: 1, partially_reversed: 0, reversed: 2, median_hours: 4.5 },
    no_action: { received: 5, upheld: 4, partially_reversed: 0, reversed: 1 },
    no_action_trusted_flagger: {
      received: 6,
      upheld: 2,
      partially_reversed: 1,
      reversed: 3,
      median_hours: 8.5,
    },
  },
} satisfies DsaCopyrightTransparencyFigures

describe('EU copyright transparency CSV rendering', () => {
  it('records the Commission templates byte for byte', () => {
    expect(createHash('sha256').update(DSA_REPORT_PART4_TEMPLATE).digest('hex')).toBe(
      'c9d8986a04c01a6ae4b84583f3479323eceb884489608474c7d0976fb20eb9e6',
    )
    expect(createHash('sha256').update(DSA_REPORT_PART7_TEMPLATE).digest('hex')).toBe(
      'c355cf9369a115fa51f9c9626cc7917bc24b48db7d6dc6cff3028c81de388aad',
    )
  })

  it('rejects non-midnight boundaries for CSV output with 422', () => {
    let thrown: unknown
    try {
      renderEuCopyrightReportCsv(
        { ...report, period_start: '2026-01-01T00:00:00.001Z' },
        'csv_notices',
      )
    } catch (err) {
      thrown = err
    }
    expect(thrown).toMatchObject({ status: 422 })
  })

  it('renders only the copyright Part 4 rows with exact header and an inclusive period', () => {
    const csv = renderEuCopyrightReportCsv(report, 'csv_notices')
    const rows = parseCsv(csv)
    const fixtureRows = parseCsv(DSA_REPORT_PART4_TEMPLATE)
    expect(csv.startsWith(`${fixtureHeader(DSA_REPORT_PART4_TEMPLATE)}\r\n`)).toBe(true)
    expect(rows).toHaveLength(3)
    expect(rows.every(row => row.length === 25)).toBe(true)
    expect(rows.slice(1).map(row => row[3])).toEqual([
      'STATEMENT_CATEGORY_INTELLECTUAL_PROPERTY_INFRINGEMENTS',
      'KEYWORD_COPYRIGHT_INFRINGEMENT',
    ])
    expect(rows.slice(1).map(row => row[2])).toEqual([
      '2026-01-01/2026-12-31',
      '2026-01-01/2026-12-31',
    ])
    expect(rows[1]!.slice(5, 15)).toEqual(['9', '2', '12', '3', '4.25', '2.5', '5', '1', '0', '0'])
    expect(rows[2]!.slice(5, 15)).toEqual(rows[1]!.slice(5, 15))
    expect(
      rows.slice(1).every(row => row[1] === '' && row.slice(15).every(cell => cell === '')),
    ).toBe(true)
    expect(rows.some(row => row[3] === 'TOTAL')).toBe(false)
    expect(
      rows
        .slice(1)
        .every(row =>
          fixtureRows.some(template => template[0] === row[0] && template[3] === row[3]),
        ),
    ).toBe(true)
    expectCrLf(csv)
  })

  it('renders the three complaint indicators and leaves an unavailable median blank', () => {
    const csv = renderEuCopyrightReportCsv(report, 'csv_complaints')
    const rows = parseCsv(csv)
    const fixtureRows = parseCsv(DSA_REPORT_PART7_TEMPLATE)
    expect(csv.startsWith(`${fixtureHeader(DSA_REPORT_PART7_TEMPLATE)}\r\n`)).toBe(true)
    expect(rows).toHaveLength(16)
    expect(rows.every(row => row.length === 8)).toBe(true)
    expect(rows.slice(1, 6).map(row => row[6])).toEqual(['3', '1', '0', '2', '4.5'])
    expect(rows.slice(6, 11).map(row => row[6])).toEqual(['5', '4', '0', '1', ''])
    expect(rows.slice(11).map(row => row[6])).toEqual(['6', '2', '1', '3', '8.5'])
    expect(
      rows
        .slice(1)
        .every(row =>
          fixtureRows.some(
            template =>
              template[0] === row[0] &&
              template[3] === row[3] &&
              template[4] === row[4] &&
              template[5] === row[5],
          ),
        ),
    ).toBe(true)
    expect(rows.slice(1).every(row => row[1] === '' && row[7] === '')).toBe(true)
    expectCrLf(csv)
  })
})

function expectCrLf(csv: string): void {
  expect(csv.endsWith('\r\n')).toBe(true)
  expect(csv.replaceAll('\r\n', '')).not.toContain('\n')
  expect(csv.replaceAll('\r\n', '')).not.toContain('\r')
}

function fixtureHeader(template: string): string {
  return template.split(/\r?\n/, 1)[0]!
}

function parseCsv(csv: string): string[][] {
  const content = csv.endsWith('\r\n')
    ? csv.slice(0, -2)
    : csv.endsWith('\n')
      ? csv.slice(0, -1)
      : csv
  const lines = content.split(/\r?\n/)
  return lines.map(parseRecord)
}

function parseRecord(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!
    if (quoted && character === '"' && line[index + 1] === '"') {
      cell += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (!quoted && character === ',') {
      cells.push(cell)
      cell = ''
    } else {
      cell += character
    }
  }
  if (quoted) throw new Error('CSV record has an unterminated quoted cell')
  cells.push(cell)
  return cells
}
