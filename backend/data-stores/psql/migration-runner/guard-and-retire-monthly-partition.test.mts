import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  assertSafeSqlIdentifier,
  buildMonthlyPartitionName,
} from '@vouchington/postgres/partitions'
import {
  acquireTestModerationTransparencyDateReservation,
  createTestUser,
  getTestReleasedModerationTransparencyRollupCount,
  insertTestPostClearanceChange,
  insertTestReleasedModerationTransparencyRollupRow,
} from '@voucha/test-helpers'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { PARTITION_DROP_POLICIES } from '../config-driven/utils/partition-drop-policies.mts'
import { beginTransaction, write } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import { guardAndRetireMonthlyPartition } from './guard-and-retire-monthly-partition.mts'
import { createPostClearancePartitions } from './create-post-clearance-partitions.mts'
import { retireMonthlyPartitionCandidate } from './monthly-partitions.mts'
import { getMonthlyPartitionUpperBound } from './partition-drop-guard.mts'

type PartitionDropOutcome = Awaited<ReturnType<typeof retireMonthlyPartitionCandidate>>

const now = new Date('2026-10-23T00:00:00.000Z')
const candidate = {
  table: 'ai_usage_records',
  partition: 'ai_usage_records__p_2025_01',
  upperBound: new Date('2025-02-01T00:00:00.000Z'),
}

function recordingTransaction(options: { nonEmpty: boolean }) {
  const statements: string[] = []
  const transaction = (async (statement: string) => {
    statements.push(statement)
    return { rows: statement.includes('probeNonEmpty') && options.nonEmpty ? [{ x: 1 }] : [] }
  }) as unknown as QueryExecutor
  return { statements, transaction }
}

const tags = (statements: string[]) =>
  statements.map(statement => statement.match(/\/\* ([^*]+) \*\//)?.[1])

describe('AI usage partition retirement locking', () => {
  const policy = PARTITION_DROP_POLICIES.ai_usage_records

  it('probes a non-empty child without taking any lock', async () => {
    const { statements, transaction } = recordingTransaction({ nonEmpty: true })

    await expect(
      guardAndRetireMonthlyPartition(transaction, candidate, policy, now, 1),
    ).resolves.toBe('in-flight')

    expect(tags(statements)).toEqual(['cleanupPartitions:probeNonEmpty'])
    expect(statements.some(statement => /LOCK TABLE|SET LOCAL/.test(statement))).toBe(false)
  })

  it('locks referenced tables, then the parent and child, all without waiting', async () => {
    const { statements, transaction } = recordingTransaction({ nonEmpty: false })

    await expect(
      guardAndRetireMonthlyPartition(transaction, candidate, policy, now, 1),
    ).resolves.toBe(null)

    expect(tags(statements).slice(0, 5)).toEqual([
      'cleanupPartitions:probeNonEmpty',
      'cleanupPartitions:lockReference',
      'cleanupPartitions:lockParent',
      'cleanupPartitions:lockCandidate',
      'getPartitionDropRefusal:nonempty',
    ])
    const references = statements.find(statement => statement.includes('lockReference'))!
    for (const table of policy!.retirementReferenceTables!) expect(references).toContain(table)
    const locks = statements.filter(statement => statement.includes('LOCK TABLE'))
    expect(locks.every(statement => statement.includes('NOWAIT'))).toBe(true)
  })
})

const TABLE = 'post_clearance_changes'
const METRIC = 'automated_moderation'
const CATEGORY = 'post_clearance_reject'
/** Public release refuses a cohort below this count, so the fixture must cross it. */
const PUBLIC_RELEASE_COUNT = 20

describe('guardAndRetireMonthlyPartition', () => {
  it('keeps a released moderation transparency cohort when its clearance month is dropped', async () => {
    const reservation = await acquireTestModerationTransparencyDateReservation()
    onTestFinished(() => reservation.release())
    const occurredAt = reservation.now
    const year = occurredAt.getUTCFullYear()
    const month = occurredAt.getUTCMonth() + 1
    const partition = buildMonthlyPartitionName(TABLE, year, month)
    // One owned child. A catalog sweep at this reference date would also retire live months.
    const partitionConfig = { pastMonths: 0, futureMonths: 0 }
    await createPostClearancePartitions(partitionConfig, occurredAt)
    await createPostClearancePartitions(partitionConfig, occurredAt)

    const author = await createTestUser()
    const postId = await insertTestPost({
      title: 'Clearance history retirement',
      slug: `clearance-retirement-${randomUUID()}`,
      markdown: 'Owned post for a dropped clearance month.',
      createdById: author.id,
      communityId: null,
      clearanceStatus: 'pending',
    })
    await Promise.all(
      Array.from({ length: PUBLIC_RELEASE_COUNT }, (_, sequence) =>
        insertTestPostClearanceChange({
          postId,
          status: 'rejected',
          moderationTransparencyCategories: [CATEGORY],
          occurredAt,
          occurredAtSequence: sequence,
        }),
      ),
    )

    await expect(releasedCount(occurredAt)).resolves.toBeUndefined()
    await insertTestReleasedModerationTransparencyRollupRow({
      occurredAt,
      metric: METRIC,
      category: CATEGORY,
      count: PUBLIC_RELEASE_COUNT,
    })
    await expect(releasedCount(occurredAt)).resolves.toBe(PUBLIC_RELEASE_COUNT)

    const upperBound = getMonthlyPartitionUpperBound(TABLE, partition)
    const minimumMonths = PARTITION_DROP_POLICIES[TABLE]?.minimumRetentionMonths
    if (!upperBound || minimumMonths == null) {
      throw new Error('Clearance history partition has no calendar retention bound')
    }
    const referenceDate = new Date(
      Date.UTC(upperBound.getUTCFullYear(), upperBound.getUTCMonth() + minimumMonths, 15),
    )
    // The hook waits for the production locks, so the path's NOWAIT locks are already held.
    // Waiting for several shared tables while holding the first deadlocks with any writer that
    // enters them in the other order, and no order suits every writer. The vitest project that
    // owns this file runs it after the parallel projects finish, so no writer is active.
    const outcome = await retireOwnedClearancePartition(partition, upperBound, referenceDate)
    expect(outcome).toEqual({ table: TABLE, partition, outcome: 'dropped' })

    await expect(releasedCount(occurredAt)).resolves.toBe(PUBLIC_RELEASE_COUNT)
  })
})

function retireOwnedClearancePartition(
  partition: string,
  upperBound: Date,
  referenceDate: Date,
): Promise<PartitionDropOutcome> {
  const referenceTables = PARTITION_DROP_POLICIES[TABLE]?.retirementReferenceTables ?? []
  // Lock order is irrelevant while the file runs alone; posts first keeps the order stable.
  const orderedReferences = [
    ...referenceTables.filter(table => table === 'posts'),
    ...referenceTables.filter(table => table !== 'posts'),
  ]
  const parent = assertSafeSqlIdentifier(TABLE)
  const child = assertSafeSqlIdentifier(partition)
  return retireMonthlyPartitionCandidate(
    { table: TABLE, partition, upperBound },
    referenceDate,
    1,
    async () => {
      const transaction = await beginTransaction()
      try {
        for (const table of orderedReferences) {
          await transaction(
            `/* retireOwnedClearancePartition:lockReference */ LOCK TABLE ${assertSafeSqlIdentifier(table)} IN ACCESS EXCLUSIVE MODE`,
          )
        }
        await transaction(
          `/* retireOwnedClearancePartition:lockParent */ LOCK TABLE ${parent} IN ACCESS EXCLUSIVE MODE`,
        )
        await transaction(
          `/* retireOwnedClearancePartition:lockCandidate */ LOCK TABLE ${child} IN ACCESS EXCLUSIVE MODE`,
        )
        await transaction(
          '/* retireOwnedClearancePartition:lockHolds */ LOCK TABLE user_legal_preservation_holds IN SHARE MODE',
        )
      } catch (err) {
        await transaction.rollback()
        throw err
      }
      return transaction
    },
  )
}

function releasedCount(occurredAt: Date): Promise<number | undefined> {
  return getTestReleasedModerationTransparencyRollupCount({
    occurredAt,
    metric: METRIC,
    category: CATEGORY,
  })
}
