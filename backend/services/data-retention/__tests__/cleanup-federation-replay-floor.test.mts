import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import {
  createTestUserDirect,
  insertCompletedFederationReplayForTest,
  isReplayFloorLockedForTest,
  prepareFederationDistributionPageForTest,
  prepareFederationDistributionReplayForTest,
  readFederationReplayFloorForTest,
  resetActivityPubReplayRetentionCursorForTest,
} from '@voucha/test-helpers'
import {
  withCommittedPostgresTransactionForTest,
  withPostgresTransactionForTest,
} from '@voucha/test-helpers/postgres-transaction'
import { deleteTestUser } from '@voucha/test-helpers/data-stores/psql/moderation-admission-relations'
import { activityPubInboxConfig } from '@services/ap-inbox-activities/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { cleanupActivityPubReplayLedger } from '../cleanup-activitypub-replay.mts'

describe('replay floor', () => {
  it('keeps purged outbound UUIDv7 identities retired across age policy changes', async () => {
    const sender = await createTestUserDirect()
    onTestFinished(() => deleteTestUser(sender.id))
    const now = new Date()
    const oldCreatedAt = new Date(now.getTime() - 40 * 86_400_000)
    const oldId = v7({ msecs: oldCreatedAt.getTime() })
    const nextId = v7({ msecs: oldCreatedAt.getTime() + 1 })
    const recentId = v7({ msecs: now.getTime() - 20 * 86_400_000 })
    const restoreDefault = overrideDynamicConfigFieldsForTest(activityPubInboxConfig, {
      maximum_activity_age_days: 30,
    })
    onTestFinished(restoreDefault)
    await withPostgresTransactionForTest(async query => {
      await insertCompletedFederationReplayForTest(query, {
        activityId: oldId,
        sourceUserId: sender.id,
        completedAt: new Date(now.getTime() - 31 * 86_400_000),
      })
      await resetActivityPubReplayRetentionCursorForTest(query, 'outbound')
      expect(
        await cleanupActivityPubReplayLedger('outbound', {
          batchSize: 1,
          maxBatches: 1,
          now,
          borrowedQuery: query,
          scope: { activityIds: [oldId] },
        }),
      ).toMatchObject({ deleted: 1, hasMore: false })
      expect(await readFederationReplayFloorForTest(query, 'outbound')).toEqual(oldCreatedAt)
      const restoreWider = overrideDynamicConfigFieldsForTest(activityPubInboxConfig, {
        maximum_activity_age_days: 60,
      })
      try {
        expect(await prepareFederationDistributionPageForTest(oldId, sender.id, query)).toEqual({
          status: 'expired',
        })
        expect(
          await prepareFederationDistributionPageForTest(nextId, sender.id, query),
        ).toMatchObject({
          status: 'ready',
        })
        expect(
          await prepareFederationDistributionPageForTest(recentId, sender.id, query),
        ).toMatchObject({
          status: 'ready',
        })
      } finally {
        restoreWider()
      }
      const restoreNarrow = overrideDynamicConfigFieldsForTest(activityPubInboxConfig, {
        maximum_activity_age_days: 15,
      })
      try {
        expect(await prepareFederationDistributionPageForTest(oldId, sender.id, query)).toEqual({
          status: 'expired',
        })
      } finally {
        restoreNarrow()
      }
      const restoreWiderAgain = overrideDynamicConfigFieldsForTest(activityPubInboxConfig, {
        maximum_activity_age_days: 60,
      })
      try {
        expect(await prepareFederationDistributionPageForTest(oldId, sender.id, query)).toEqual({
          status: 'expired',
        })
      } finally {
        restoreWiderAgain()
      }
    })
  })

  it('holds the replay-floor row lock through an uncommitted purge', async () => {
    const sender = await createTestUserDirect()
    onTestFinished(() => deleteTestUser(sender.id))
    const now = new Date()
    const oldId = v7({ msecs: now.getTime() - 40 * 86_400_000 })
    await withCommittedPostgresTransactionForTest(query =>
      insertCompletedFederationReplayForTest(query, {
        activityId: oldId,
        sourceUserId: sender.id,
        completedAt: new Date(now.getTime() - 31 * 86_400_000),
      }),
    )

    await withPostgresTransactionForTest(async query => {
      await resetActivityPubReplayRetentionCursorForTest(query, 'outbound')
      expect(
        await cleanupActivityPubReplayLedger('outbound', {
          batchSize: 1,
          maxBatches: 1,
          now,
          borrowedQuery: query,
          scope: { activityIds: [oldId] },
        }),
      ).toMatchObject({ deleted: 1, hasMore: false })
      expect(await isReplayFloorLockedForTest('outbound')).toBe(true)
    })
    expect(await prepareFederationDistributionReplayForTest(oldId, sender.id)).toEqual({
      status: 'completed',
    })
  })
})
