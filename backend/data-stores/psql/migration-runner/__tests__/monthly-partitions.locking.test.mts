import { describe, expect, it } from 'vitest'
import type { QueryExecutor } from '../../types.mts'
import { guardAndRetireMonthlyPartition } from '../monthly-partitions.mts'

describe('monthly partition retirement locks', () => {
  it('takes referenced-table NOWAIT locks before any topic history lock', async () => {
    const statements: string[] = []
    const transaction = (async (statement: string) => {
      statements.push(statement)
      if (statement.includes('lockReference')) throw new Error('referenced table busy')
      return { rows: [] }
    }) as unknown as QueryExecutor
    await expect(
      guardAndRetireMonthlyPartition(
        transaction,
        {
          table: 'topic_revisions',
          partition: 'topic_revisions__p_1999_12',
          upperBound: new Date('2000-01-01T00:00:00.000Z'),
        },
        {
          minimumRetentionDays: null,
          minimumRetentionMonths: 12,
          retirementReferenceTables: ['topics', 'users'],
        },
        new Date('2013-01-15T00:00:00.000Z'),
      ),
    ).rejects.toThrow('referenced table busy')
    expect(statements).toEqual([
      '/* cleanupPartitions:lockReference */ LOCK TABLE topics, users IN ACCESS EXCLUSIVE MODE NOWAIT',
    ])
  })

  it('takes both topic history locks without waiting after referenced-table locks', async () => {
    const statements: string[] = []
    const transaction = (async (statement: string) => {
      statements.push(statement)
      if (statement.includes('lockCandidate')) throw new Error('child busy')
      return { rows: [] }
    }) as unknown as QueryExecutor
    await expect(
      guardAndRetireMonthlyPartition(
        transaction,
        {
          table: 'topic_revisions',
          partition: 'topic_revisions__p_1999_12',
          upperBound: new Date('2000-01-01T00:00:00.000Z'),
        },
        {
          minimumRetentionDays: null,
          minimumRetentionMonths: 12,
          retirementReferenceTables: ['topics', 'users'],
        },
        new Date('2013-01-15T00:00:00.000Z'),
      ),
    ).rejects.toThrow('child busy')
    expect(statements).toEqual([
      '/* cleanupPartitions:lockReference */ LOCK TABLE topics, users IN ACCESS EXCLUSIVE MODE NOWAIT',
      '/* cleanupPartitions:lockParent */ LOCK TABLE topic_revisions IN ACCESS EXCLUSIVE MODE NOWAIT',
      '/* cleanupPartitions:lockCandidate */ LOCK TABLE topic_revisions__p_1999_12 IN ACCESS EXCLUSIVE MODE NOWAIT',
    ])
  })
})
