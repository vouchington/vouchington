import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import sql from 'sql-template-strings'
import { onTestFinished } from 'vitest'
import { beginTransaction, write, writePool, type PoolClient } from '@data-stores/psql'
import { buildMonthlyPartitionName } from '@vouchington/postgres/partitions'
import {
  observePostgresLockNotice,
  runPoolObservationExclusively,
} from 'vouchington-tooling/postgres-test-faults'
import { recordModerationTrainingFeedback } from '../services/moderation-training/feedback.mts'
import { PARTITION_DROP_POLICIES } from '../data-stores/psql/config-driven/utils/partition-drop-policies.mts'
import { POST_CLEARANCE_CHANGES } from '../data-stores/psql/migration-runner/create-post-clearance-partitions.mts'
import { retireMonthlyPartitionCandidate } from '../data-stores/psql/migration-runner/monthly-partitions.mts'
import { getMonthlyPartitionUpperBound } from '../data-stores/psql/migration-runner/partition-drop-guard.mts'
import { acquireTestModerationTransparencyDateReservation } from './entities/moderation-transparency-date-reservation.mts'
import { insertTestPost } from './entities/posts.mts'
import { createTestUserDirect } from './entities/users-direct.mts'
import { hardDeleteTestUser } from './entities/users-lifecycle.mts'
import { deleteTestPostRow } from './publication-test-queries.mts'
import { testLockNoticeOptions } from './postgres-lock-notice-options.mts'

export async function createTestClearancePartitionFeedbackRace() {
  const reservation = await acquireTestModerationTransparencyDateReservation()
  const occurredAt = reservation.now
  const partition = buildMonthlyPartitionName(
    POST_CLEARANCE_CHANGES,
    occurredAt.getUTCFullYear(),
    occurredAt.getUTCMonth() + 1,
  )
  let owned = false
  let actorUserId: string | undefined
  let postId: string | undefined
  onTestFinished(async () => {
    try {
      if (postId) {
        await using transaction = await beginTransaction()
        await deleteTestPostRow(transaction, postId)
        await transaction.commit()
      }
      if (actorUserId) await hardDeleteTestUser(actorUserId)
      if (owned && (await getTestClearancePartitionState(partition)) === 'attached') {
        await retireTestRacePartition(partition)
      }
    } finally {
      await reservation.release()
    }
  })
  if ((await getTestClearancePartitionState(partition)) !== 'absent')
    throw new Error(`Test month already has a relation called ${partition}`)
  owned = true
  const actor = await createTestUserDirect()
  actorUserId = actor.id
  postId = await insertTestPost({
    title: 'Clearance partition feedback',
    slug: `clearance-feedback-${randomUUID()}`,
    markdown: 'Owned post for feedback during clearance partition creation.',
    createdById: actor.id,
    clearanceStatus: 'pending',
  })
  return { partition, occurredAt, postId, actorUserId }
}

async function retireTestRacePartition(partition: string): Promise<void> {
  const table = POST_CLEARANCE_CHANGES
  const upperBound = getMonthlyPartitionUpperBound(table, partition)
  const minimumMonths = PARTITION_DROP_POLICIES[table]?.minimumRetentionMonths
  if (!upperBound || minimumMonths == null)
    throw new Error('Clearance history partition has no calendar retention bound')
  const referenceDate = new Date(
    Date.UTC(upperBound.getUTCFullYear(), upperBound.getUTCMonth() + minimumMonths, 15),
  )
  const result = await retireMonthlyPartitionCandidate(
    { table, partition, upperBound },
    referenceDate,
    1,
  )
  if (result.outcome !== 'dropped')
    throw new Error(`Cleanup could not retire owned clearance partition ${partition}`, {
      cause: result,
    })
}

export async function recordFeedbackDuringClearancePartitionCreation(
  { postId, actorUserId }: { postId: string; actorUserId: string },
  createPartition: () => Promise<void>,
): Promise<string[]> {
  const { rows } = await write<{ tag: string }>(sql`
    /* recordFeedbackDuringClearancePartitionCreation:relation */
    SELECT 'relation ' || 'moderation_training_feedbacks'::regclass::oid::text ||
      ' of database ' || oid::text AS tag
    FROM pg_database WHERE datname = current_database()
  `)
  const tag = rows[0]?.tag
  if (!tag) throw new Error('Feedback relation has no PostgreSQL lock tag')

  return runPoolObservationExclusively(async () => {
    await using holder = await beginTransaction()
    const recordFeedback = () =>
      recordModerationTrainingFeedback(
        {
          trainingEvidence: 'staff_or_user',
          sourceType: 'community_review',
          eventType: 'manual_action_inferred',
          label: 'true_negative',
          humanAction: 'approve_publication',
          actorUserId,
          postId,
        },
        { query: holder },
      )
    const first = await recordFeedback()
    const client = await writePool.connect()
    const release = client.release
    const observation = observePostgresLockNotice(
      client,
      tag,
      'ShareRowExclusiveLock',
      testLockNoticeOptions,
    )
    let operation: Promise<void> | undefined
    let releaseReason: Parameters<PoolClient['release']>[0]
    try {
      await observation.ready
      client.release = reason => {
        releaseReason = reason
      }
      operation = startWithReservedWriteClient(client, createPartition)
      await Promise.race([operation, observation.wait(Promise.allSettled([operation]))])
      const second = await recordFeedback()
      await holder.commit()
      await operation
      return [first.id, second.id]
    } finally {
      try {
        await holder[Symbol.asyncDispose]()
      } finally {
        await Promise.allSettled([operation])
        client.release = release
        await observation
          .close()
          .catch((err: unknown) => {
            releaseReason = true
            throw err
          })
          .finally(() => release.call(client, releaseReason))
      }
    }
  })
}

function startWithReservedWriteClient(client: PoolClient, action: () => Promise<void>) {
  const scope = new AsyncLocalStorage<boolean>()
  const descriptor = Object.getOwnPropertyDescriptor(writePool, 'connect')
  const connect = writePool.connect
  const restore = () => {
    if (descriptor) Object.defineProperty(writePool, 'connect', descriptor)
    else Reflect.deleteProperty(writePool, 'connect')
  }
  writePool.connect = ((...args: unknown[]) => {
    if (!scope.getStore() || args.length !== 0) return Reflect.apply(connect, writePool, args)
    restore()
    return Promise.resolve(client)
  }) as typeof connect
  return scope.run(true, async () => {
    try {
      await action()
    } finally {
      restore()
    }
  })
}

export async function getTestClearancePartitionState(
  partition: string,
): Promise<'absent' | 'attached' | 'unattached'> {
  const { rows } = await write<{ state: 'absent' | 'attached' | 'unattached' }>(sql`
    /* getTestClearancePartitionState */
    SELECT CASE WHEN to_regclass(${partition}) IS NULL THEN 'absent' WHEN EXISTS (
      SELECT 1 FROM pg_inherits
      WHERE inhrelid = to_regclass(${partition})
        AND inhparent = 'post_clearance_changes'::regclass
        AND NOT inhdetachpending
    ) THEN 'attached' ELSE 'unattached' END AS state
  `)
  return rows[0]!.state
}

export async function readTestClearanceFeedbackIds(ids: readonly string[]): Promise<string[]> {
  const { rows } = await write<{ id: string }>(sql`
    /* readTestClearanceFeedbackIds */
    SELECT id FROM moderation_training_feedbacks WHERE id = ANY(${ids}::uuid[])
  `)
  return rows.map(row => row.id)
}
