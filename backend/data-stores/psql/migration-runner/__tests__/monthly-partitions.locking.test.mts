import { describe, expect, it } from 'vitest'
import { PARTITION_DROP_POLICIES } from '../../config-driven/utils/partition-drop-policies.mts'
import type { QueryExecutor } from '../../types.mts'
import { guardAndRetireMonthlyPartition } from '../guard-and-retire-monthly-partition.mts'

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
        500,
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
        500,
      ),
    ).rejects.toThrow('child busy')
    expect(statements).toEqual([
      '/* cleanupPartitions:lockReference */ LOCK TABLE topics, users IN ACCESS EXCLUSIVE MODE NOWAIT',
      '/* cleanupPartitions:lockParent */ LOCK TABLE topic_revisions IN ACCESS EXCLUSIVE MODE NOWAIT',
      '/* cleanupPartitions:lockCandidate */ LOCK TABLE topic_revisions__p_1999_12 IN ACCESS EXCLUSIVE MODE NOWAIT',
    ])
  })

  it.each([
    ['post_clearance_changes', 'moderation_training_feedbacks, posts, retained_user_identities'],
    [
      'community_post_review_changes',
      'communities, community_post_reviews, retained_user_identities',
    ],
  ])('locks %s referenced tables, parent, and child without waiting', async (table, references) => {
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
          table,
          partition: `${table}__p_2000_01`,
          upperBound: new Date('2000-02-01T00:00:00.000Z'),
        },
        PARTITION_DROP_POLICIES[table],
        new Date('2013-01-15T00:00:00.000Z'),
        500,
      ),
    ).rejects.toThrow('child busy')
    expect(statements).toEqual([
      `/* cleanupPartitions:lockReference */ LOCK TABLE ${references} IN ACCESS EXCLUSIVE MODE NOWAIT`,
      `/* cleanupPartitions:lockParent */ LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE NOWAIT`,
      `/* cleanupPartitions:lockCandidate */ LOCK TABLE ${table}__p_2000_01 IN ACCESS EXCLUSIVE MODE NOWAIT`,
    ])
  })
})
