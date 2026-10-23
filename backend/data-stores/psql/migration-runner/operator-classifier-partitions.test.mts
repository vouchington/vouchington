import { describe, expect, it } from 'vitest'
import type { QueryExecutor } from '../types.mts'
import { CLASSIFIER_RESULT_PARTITION_TABLES } from '../config-driven/utils/partition-config.mts'
import { parseClassifierPartitionRange } from './classifier-partition-range.mts'
import { guardAndRetireClassifierResultRange } from './operator-classifier-partitions.mts'

const input = { fromDate: '2020-02-01', toDate: '2020-02-02' }
const range = parseClassifierPartitionRange(input)
const referenceDate = new Date('2026-10-23T00:00:00.000Z')
const tables = CLASSIFIER_RESULT_PARTITION_TABLES

function createCapture() {
  const statements: string[] = []
  let pendingBatches = false
  let pendingRuns = false
  let busyProducer = false
  let attached = true
  const query = (async (statement: string) => {
    statements.push(statement)
    if (statement.includes('readClassifierChildren')) {
      const rows = tables.flatMap(table => [
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
    if (busyProducer && statement.includes('retireClassifierResultRange:lockRuns')) {
      throw Object.assign(new Error('producer holds classifier_runs'), { code: '55P03' })
    }
    if (statement.includes('assertNoPendingClassifierWork:batches')) {
      return { rows: pendingBatches ? [{ '?column?': 1 }] : [] }
    }
    if (statement.includes('assertNoPendingClassifierWork:runs')) {
      return { rows: pendingRuns ? [{ '?column?': 1 }] : [] }
    }
    return { rows: [] }
  }) as unknown as QueryExecutor
  return {
    query,
    statements,
    setPendingBatches: (value: boolean) => {
      pendingBatches = value
    },
    setPendingRuns: (value: boolean) => {
      pendingRuns = value
    },
    setBusyProducer: (value: boolean) => {
      busyProducer = value
    },
    setAttached: (value: boolean) => {
      attached = value
    },
  }
}

describe('operator classifier range retirement SQL contract', () => {
  it('refuses pending work and producer contention before any detach', async () => {
    const capture = createCapture()
    capture.setPendingBatches(true)
    await expect(
      guardAndRetireClassifierResultRange(capture.query, input, 90, referenceDate),
    ).rejects.toThrow('incomplete batches')
    expect(capture.statements.some(statement => statement.includes(':detach'))).toBe(false)

    capture.statements.length = 0
    capture.setPendingBatches(false)
    capture.setPendingRuns(true)
    await expect(
      guardAndRetireClassifierResultRange(capture.query, input, 90, referenceDate),
    ).rejects.toThrow('pending runs')
    expect(capture.statements.some(statement => statement.includes(':detach'))).toBe(false)

    capture.statements.length = 0
    capture.setPendingRuns(false)
    capture.setBusyProducer(true)
    await expect(
      guardAndRetireClassifierResultRange(capture.query, input, 90, referenceDate),
    ).rejects.toMatchObject({ code: '55P03' })
    expect(capture.statements.some(statement => statement.includes(':detach'))).toBe(false)
  })

  it('checks the locked catalog and bounded probes before three aligned detach/drop pairs', async () => {
    const capture = createCapture()
    await guardAndRetireClassifierResultRange(capture.query, input, 90, referenceDate)
    const positions = (marker: string) =>
      capture.statements.flatMap((statement, index) => (statement.includes(marker) ? [index] : []))
    expect(positions('retireClassifierResultRange:lockChild')).toHaveLength(3)
    expect(positions('retireClassifierResultRange:lockRuns')[0]).toBeGreaterThan(
      positions('retireClassifierResultRange:lockChild').at(-1)!,
    )
    expect(positions('assertNoPendingClassifierWork:runs')[0]).toBeLessThan(
      positions('retireClassifierResultRange:detach')[0]!,
    )
    expect(positions('retireClassifierResultRange:detach')).toHaveLength(3)
    expect(positions('retireClassifierResultRange:drop')).toHaveLength(3)

    capture.statements.length = 0
    capture.setAttached(false)
    await guardAndRetireClassifierResultRange(capture.query, input, 90, referenceDate)
    expect(capture.statements.some(statement => statement.includes(':detach'))).toBe(false)
  })
})
