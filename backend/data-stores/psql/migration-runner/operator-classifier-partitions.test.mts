import { describe, expect, it } from 'vitest'
import type { QueryExecutor } from '../types.mts'
import { CLASSIFIER_RESULT_PARTITION_TABLES } from '../config-driven/utils/partition-config.mts'
import { assertAllRangesAttached } from './classifier-partition-catalog.mts'
import {
  CLASSIFIER_PARTITION_MAX_TOTAL_ROWS,
  parseClassifierPartitionRange,
} from './classifier-partition-range.mts'
import {
  createClassifierResultRange,
  guardAndCreateClassifierResultRange,
  retireClassifierResultRange,
} from './operator-classifier-partitions.mts'

const input = { fromDate: '2020-02-01', toDate: '2020-02-02' }
const range = parseClassifierPartitionRange(input)
const referenceDate = new Date('2026-10-23T00:00:00.000Z')
const tables = CLASSIFIER_RESULT_PARTITION_TABLES

function createCapture() {
  const statements: string[] = []
  let attached = true
  let failAt: string | undefined
  let defaultRows: { parent_table: string; batch_id: string; inside_range: boolean }[] = []
  let catalogRows:
    | { parent_table: string | null; partition_name: string; partition_bound: string | null }[]
    | undefined
  const query = (async (statement: string) => {
    statements.push(statement)
    if (failAt && statement.includes(failAt)) throw new Error(`injected ${failAt} failure`)
    if (statement.includes('readClassifierChildren')) {
      const rows =
        catalogRows ??
        tables.flatMap(table => [
          { parent_table: table, partition_name: `${table}__default`, partition_bound: 'DEFAULT' },
          ...(attached
            ? [
                {
                  parent_table: table,
                  partition_name: `${table}__${range.nameSuffix}`,
                  partition_bound: `FOR VALUES FROM ('${range.fromId}'::uuid) TO ('${range.toId}'::uuid)`,
                },
              ]
            : []),
        ])
      return { rows }
    }
    if (statement.includes('assertDefaultsFitRange')) return { rows: defaultRows }
    return { rows: [] }
  }) as unknown as QueryExecutor
  return {
    query,
    statements,
    setAttached: (value: boolean) => {
      attached = value
    },
    setDefaultRows: (rows: typeof defaultRows) => {
      defaultRows = rows
    },
    setFailAt: (marker: string) => {
      failAt = marker
    },
    setCatalogRows: (rows: NonNullable<typeof catalogRows>) => {
      catalogRows = rows
    },
  }
}

describe('operator classifier range sealing SQL contract', () => {
  it('rejects future create and unaged retirement before opening a transaction', async () => {
    const future = { fromDate: '2099-01-01', toDate: '2099-01-02' }
    await expect(createClassifierResultRange(future)).rejects.toThrow(
      'cannot be created ahead of observed data',
    )
    await expect(retireClassifierResultRange(future, 90)).rejects.toThrow('retirement refused')
  })

  it('seals populated aligned defaults only after the catalog and row-bound checks', async () => {
    const capture = createCapture()
    capture.setAttached(false)
    capture.setDefaultRows(
      tables.map(parent_table => ({
        parent_table,
        batch_id: range.fromId,
        inside_range: true,
      })),
    )
    await guardAndCreateClassifierResultRange(capture.query, input, referenceDate)
    const positions = (marker: string) =>
      capture.statements.flatMap((statement, index) => (statement.includes(marker) ? [index] : []))
    expect(positions('lockClassifierResultParents')).toHaveLength(1)
    expect(positions('lockClassifierResultFkTargets')[0]).toBeLessThan(
      positions('lockClassifierResultParents')[0]!,
    )
    expect(positions('assertDefaultsFitRange')[0]).toBeLessThan(
      positions('createClassifierResultRange:detach')[0]!,
    )
    for (const marker of ['detach', 'rename', 'attach', 'newDefault']) {
      expect(positions(`createClassifierResultRange:${marker}`)).toHaveLength(tables.length)
    }
    expect(positions('releaseDetachedCandidateReferences')).toHaveLength(2)
    expect(positions('releaseDetachedCandidateReferences').at(-1)).toBeLessThan(
      positions('createClassifierResultRange:detach').at(-1)!,
    )
    const firstAttachment = capture.statements.find(statement =>
      statement.includes('createClassifierResultRange:attach'),
    )
    expect(firstAttachment).toContain('ALTER TABLE classifier_decision_batch_candidates ATTACH')
    expect(positions('createClassifierResultRange:attach')[0]).toBeGreaterThan(
      positions('createClassifierResultRange:rename').at(-1)!,
    )
  })

  it('is idempotent for an already attached aligned range', async () => {
    const capture = createCapture()
    await guardAndCreateClassifierResultRange(capture.query, input, referenceDate)
    expect(capture.statements.some(statement => statement.includes('assertDefaultsFitRange'))).toBe(
      false,
    )
    expect(
      capture.statements.some(statement =>
        statement.includes('createClassifierResultRange:detach'),
      ),
    ).toBe(false)
  })

  it('refuses empty, out-of-range, and over-cap defaults before DDL', async () => {
    const capture = createCapture()
    capture.setAttached(false)
    await expect(
      guardAndCreateClassifierResultRange(capture.query, input, referenceDate),
    ).rejects.toThrow('no rows')
    capture.setDefaultRows([
      { parent_table: tables[0]!, batch_id: range.toId, inside_range: false },
    ])
    await expect(
      guardAndCreateClassifierResultRange(capture.query, input, referenceDate),
    ).rejects.toThrow('outside the requested range')
    capture.setDefaultRows(
      Array.from({ length: 101 }, () => ({
        parent_table: tables[0]!,
        batch_id: range.fromId,
        inside_range: true,
      })),
    )
    await expect(
      guardAndCreateClassifierResultRange(
        capture.query,
        { ...input, maxDefaultRows: 100 },
        referenceDate,
      ),
    ).rejects.toThrow('row cap exceeded')
    expect(
      capture.statements.some(statement =>
        statement.includes('createClassifierResultRange:detach'),
      ),
    ).toBe(false)
  })

  it('rejects future ranges and stops after an injected partition write failure', async () => {
    const capture = createCapture()
    await expect(
      guardAndCreateClassifierResultRange(
        capture.query,
        { fromDate: '2026-10-24', toDate: '2026-10-25' },
        referenceDate,
      ),
    ).rejects.toThrow('ahead of observed data')
    expect(capture.statements).toHaveLength(0)
    capture.setAttached(false)
    capture.setDefaultRows([
      { parent_table: tables[0]!, batch_id: range.fromId, inside_range: true },
    ])
    capture.setFailAt('createClassifierResultRange:attach')
    await expect(
      guardAndCreateClassifierResultRange(capture.query, input, referenceDate),
    ).rejects.toThrow('injected createClassifierResultRange:attach failure')
    expect(
      capture.statements.some(statement =>
        statement.includes('createClassifierResultRange:newDefault'),
      ),
    ).toBe(false)
  })

  it('rejects partial or mismatched catalog attachments before modifying defaults', async () => {
    const capture = createCapture()
    capture.setCatalogRows([
      ...tables.map(table => ({
        parent_table: table,
        partition_name: `${table}__default`,
        partition_bound: 'DEFAULT',
      })),
      {
        parent_table: tables[0]!,
        partition_name: `${tables[0]}__${range.nameSuffix}`,
        partition_bound: `FOR VALUES FROM ('${range.fromId}'::uuid) TO ('${range.toId}'::uuid)`,
      },
    ])
    await expect(
      guardAndCreateClassifierResultRange(capture.query, input, referenceDate),
    ).rejects.toThrow('incomplete')
    expect(
      capture.statements.some(statement =>
        statement.includes('createClassifierResultRange:detach'),
      ),
    ).toBe(false)

    capture.setCatalogRows([
      ...tables.map(table => ({
        parent_table: table,
        partition_name: `${table}__default`,
        partition_bound: 'DEFAULT',
      })),
      ...tables.map(table => ({
        parent_table: table,
        partition_name: `${table}__${range.nameSuffix}`,
        partition_bound: 'FOR VALUES FROM (MINVALUE) TO (MAXVALUE)',
      })),
    ])
    await expect(
      guardAndCreateClassifierResultRange(capture.query, input, referenceDate),
    ).rejects.toThrow('unexpected bounds')
    expect(
      capture.statements.some(statement =>
        statement.includes('createClassifierResultRange:detach'),
      ),
    ).toBe(false)
  })

  it('refuses a missing DEFAULT and a total DEFAULT row budget overflow', async () => {
    const missingDefault = createCapture()
    missingDefault.setCatalogRows(
      tables.slice(1).map(table => ({
        parent_table: table,
        partition_name: `${table}__default`,
        partition_bound: 'DEFAULT',
      })),
    )
    await expect(
      guardAndCreateClassifierResultRange(missingDefault.query, input, referenceDate),
    ).rejects.toThrow('DEFAULT is missing')

    const overflow = createCapture()
    overflow.setAttached(false)
    // Only the returned row count is read before this guard; avoid a large test fixture.
    overflow.setDefaultRows(
      new Array<{ parent_table: string; batch_id: string; inside_range: boolean }>(
        CLASSIFIER_PARTITION_MAX_TOTAL_ROWS + 1,
      ),
    )
    await expect(
      guardAndCreateClassifierResultRange(overflow.query, input, referenceDate),
    ).rejects.toThrow('total row cap exceeded')
    expect(
      overflow.statements.some(statement =>
        statement.includes('createClassifierResultRange:detach'),
      ),
    ).toBe(false)
  })

  it('requires all four aligned children when validating an attached range', () => {
    expect(() => assertAllRangesAttached([], range.nameSuffix, range.fromId, range.toId)).toThrow(
      'incomplete',
    )
  })
})
