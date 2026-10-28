import { describe, expect, it } from 'vitest'
import type { QueryExecutor } from '../types.mts'
import { parseClassifierPartitionRange } from './classifier-partition-range.mts'
import { guardAndCreateUserDataRequestRange } from './operator-user-data-request-partitions.mts'
import {
  guardAndRetireUserDataRequestRange,
  retireUserDataRequestRange,
} from './operator-user-data-request-retirement.mts'

const input = { fromDate: '2020-02-01', toDate: '2020-02-02', maxDefaultRows: 2 }
const range = parseClassifierPartitionRange(input)
const referenceDate = new Date('2026-10-23T00:00:00.000Z')
const tables = ['user_data_requests', 'user_data_request_attempts'] as const

type Refusal = 'unfinished' | 'recent' | 'artifacts' | 'attempts'

function captureOperator() {
  const statements: string[] = []
  let attached = false
  let defaults = 0
  let refusal: Refusal | null = null
  let wrongBounds = false
  const query = (async (statement: string) => {
    statements.push(statement)
    if (statement.includes('readUserDataRequestPartitionChildren')) {
      return {
        rows: tables.flatMap(table => [
          { parent_table: table, partition_name: `${table}__default`, partition_bound: 'DEFAULT' },
          ...(attached
            ? [
                {
                  parent_table: table,
                  partition_name: `${table}__${range.nameSuffix}`,
                  partition_bound: wrongBounds
                    ? "FOR VALUES FROM ('00000000-0000-7000-8000-000000000000'::uuid) TO ('ffffffff-ffff-7fff-bfff-ffffffffffff'::uuid)"
                    : `FOR VALUES FROM ('${range.fromId}'::uuid) TO ('${range.toId}'::uuid)`,
                },
              ]
            : []),
        ]),
      }
    }
    if (statement.includes('createUserDataRequestRange:defaultBudget')) {
      return { rows: Array.from({ length: defaults }, () => ({ parent_table: tables[0] })) }
    }
    for (const marker of ['unfinished', 'recent', 'artifacts', 'attempts'] as const) {
      if (statement.includes(`retireUserDataRequestRange:${marker}`)) {
        return { rows: marker === refusal ? [{ id: range.fromId }] : [] }
      }
    }
    return { rows: [] }
  }) as unknown as QueryExecutor
  return {
    query,
    statements,
    attach: () => {
      attached = true
    },
    defaultRows: (count: number) => {
      defaults = count
    },
    refuse: (value: Refusal) => {
      refusal = value
    },
    wrongBounds: () => {
      wrongBounds = true
    },
  }
}

function position(statements: readonly string[], marker: string): number {
  return statements.findIndex(statement => statement.includes(marker))
}

describe('operator export-request range SQL contract', () => {
  it('moves capped request and attempt rows before attach, then restores active claims', async () => {
    const capture = captureOperator()
    capture.defaultRows(2)
    await guardAndCreateUserDataRequestRange(capture.query, input)
    const marks = [
      'createUserDataRequestRange:defaultBudget',
      'createUserDataRequestRange:createRequests',
      'createUserDataRequestRange:copyRequests',
      'createUserDataRequestRange:copyAttempts',
      'createUserDataRequestRange:deleteAttempts',
      'createUserDataRequestRange:deleteRequests',
      'createUserDataRequestRange:attachRequests',
      'createUserDataRequestRange:attachAttempts',
      'createUserDataRequestRange:restoreActiveClaims',
    ]
    expect(position(capture.statements, marks[0]!)).toBeGreaterThanOrEqual(0)
    for (let index = 1; index < marks.length; index++) {
      expect(position(capture.statements, marks[index]!)).toBeGreaterThan(
        position(capture.statements, marks[index - 1]!),
      )
    }
    expect(capture.statements.some(statement => statement.includes('CASCADE'))).toBe(false)
  })

  it('refuses an oversized DEFAULT before creating children', async () => {
    const capture = captureOperator()
    capture.defaultRows(3)
    await expect(guardAndCreateUserDataRequestRange(capture.query, input)).rejects.toThrow(
      'DEFAULT row cap exceeded',
    )
    expect(position(capture.statements, 'createUserDataRequestRange:createRequests')).toBe(-1)
  })

  it('is idempotent for an exact attached range and refuses mismatched bounds', async () => {
    const attached = captureOperator()
    attached.attach()
    await guardAndCreateUserDataRequestRange(attached.query, input)
    expect(position(attached.statements, 'createUserDataRequestRange:defaultBudget')).toBe(-1)
    const mismatch = captureOperator()
    mismatch.attach()
    mismatch.wrongBounds()
    await expect(guardAndCreateUserDataRequestRange(mismatch.query, input)).rejects.toThrow(
      'unexpected bounds',
    )
  })

  it('refuses a range inside the minimum age before detach', async () => {
    const today = new Date()
    const recent = {
      fromDate: today.toISOString().slice(0, 10),
      toDate: new Date(today.getTime() + 86_400_000).toISOString().slice(0, 10),
    }
    await expect(retireUserDataRequestRange(recent)).rejects.toThrow('inside-retention')
  })

  it.each([
    ['unfinished', 'unfinished export'],
    ['recent', 'recent terminal export'],
    ['artifacts', 'S3 object key'],
    ['attempts', 'S3 attempt keys'],
  ] as const)('refuses %s rows before any detach', async (blocked, message) => {
    const capture = captureOperator()
    capture.attach()
    capture.refuse(blocked)
    await expect(
      guardAndRetireUserDataRequestRange(capture.query, input, referenceDate),
    ).rejects.toThrow(message)
    expect(position(capture.statements, 'retireUserDataRequestRange:detachAttempts')).toBe(-1)
  })

  it('detaches and drops empty attempts before the aged request child without CASCADE', async () => {
    const capture = captureOperator()
    capture.attach()
    await guardAndRetireUserDataRequestRange(capture.query, input, referenceDate)
    const order = [
      'retireUserDataRequestRange:attempts',
      'retireUserDataRequestRange:detachAttempts',
      'retireUserDataRequestRange:dropAttempts',
      'retireUserDataRequestRange:detachRequests',
      'retireUserDataRequestRange:dropRequests',
    ]
    for (let index = 1; index < order.length; index++) {
      expect(position(capture.statements, order[index]!)).toBeGreaterThan(
        position(capture.statements, order[index - 1]!),
      )
    }
    expect(capture.statements.some(statement => statement.includes('CASCADE'))).toBe(false)
  })
})
