import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import {
  createTestUserDirect,
  advanceFederationReplayFloorForTest,
  ensureFederationReplayFloorForTest,
  insertCompletedFederationReplayForTest,
  isReplayFloorLockedForTest,
  prepareFederationDistributionPageForTest,
  prepareFederationDistributionReplayForTest,
  readFederationReplayFloorForTest,
} from '@voucha/test-helpers'
import {
  withCommittedPostgresTransactionForTest,
  withPostgresTransactionForTest,
} from '@voucha/test-helpers/postgres-transaction'
import { deleteTestUser } from '@voucha/test-helpers/data-stores/psql/moderation-admission-relations'
import { activityPubInboxConfig } from '@services/ap-inbox-activities/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { cleanupActivityPubReplayLedgerForTest } from '@voucha/test-helpers/federation-retention-scopes'
import { advanceReplayRejectionFloor } from '../cleanup-activitypub-replay-floor.mts'

describe('replay floor', () => {
  it('uses the latest deleted inbox receipt and outbound identity regardless of return order', async () => {
    const latest = new Date('2100-01-02T00:00:00.000Z')
    const older = new Date('2100-01-01T00:00:00.000Z')
    await withPostgresTransactionForTest(async query => {
      await advanceFederationReplayFloorForTest(query, 'inbox', older)
      await advanceReplayRejectionFloor(query, 'inbox', [
        { at: latest.toISOString(), id: v7({ msecs: latest.getTime() }) },
        { at: older.toISOString(), id: v7({ msecs: older.getTime() }) },
      ])
      expect(await readFederationReplayFloorForTest(query, 'inbox')).toEqual(
        new Date(latest.getTime() + 3_600_000),
      )
      await advanceFederationReplayFloorForTest(query, 'outbound', older)
      await advanceReplayRejectionFloor(query, 'outbound', [
        { at: older.toISOString(), id: v7({ msecs: latest.getTime() }) },
        { at: latest.toISOString(), id: v7({ msecs: older.getTime() }) },
      ])
      expect(await readFederationReplayFloorForTest(query, 'outbound')).toEqual(latest)
    })
  })

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
      expect(
        await cleanupActivityPubReplayLedgerForTest('outbound', {
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

  it('keeps the floor on an empty page and advances it only through a deleted partial page', async () => {
    const sender = await createTestUserDirect()
    onTestFinished(() => deleteTestUser(sender.id))
    const now = new Date()
    const oldAt = new Date(now.getTime() - 40 * 86_400_000)
    const firstId = v7({ msecs: oldAt.getTime() })
    const secondId = v7({ msecs: oldAt.getTime() + 1 })
    await withPostgresTransactionForTest(async query => {
      await advanceFederationReplayFloorForTest(query, 'outbound', new Date(oldAt.getTime() - 1))
      const initialFloor = await readFederationReplayFloorForTest(query, 'outbound')
      expect(
        await cleanupActivityPubReplayLedgerForTest('outbound', {
          batchSize: 1,
          maxBatches: 1,
          now,
          borrowedQuery: query,
          scope: { activityIds: [firstId, secondId] },
        }),
      ).toEqual({ deleted: 0, hasMore: false, continuationPosition: null })
      expect(await readFederationReplayFloorForTest(query, 'outbound')).toEqual(initialFloor)
      const completedAt = new Date(now.getTime() - 31 * 86_400_000)
      await insertCompletedFederationReplayForTest(query, {
        activityId: firstId,
        sourceUserId: sender.id,
        completedAt,
      })
      await insertCompletedFederationReplayForTest(query, {
        activityId: secondId,
        sourceUserId: sender.id,
        completedAt,
      })
      expect(
        await cleanupActivityPubReplayLedgerForTest('outbound', {
          batchSize: 1,
          maxBatches: 1,
          now,
          borrowedQuery: query,
          scope: { activityIds: [firstId, secondId] },
        }),
      ).toMatchObject({ deleted: 1, hasMore: true })
      expect(await readFederationReplayFloorForTest(query, 'outbound')).toEqual(
        new Date(Math.max(initialFloor?.getTime() ?? 0, oldAt.getTime())),
      )
      const restoreWider = overrideDynamicConfigFieldsForTest(activityPubInboxConfig, {
        maximum_activity_age_days: 60,
      })
      try {
        expect(await prepareFederationDistributionPageForTest(firstId, sender.id, query)).toEqual({
          status: 'expired',
        })
      } finally {
        restoreWider()
      }
    })
  })

  it('holds the replay-floor row lock through an uncommitted purge', async () => {
    const sender = await createTestUserDirect()
    onTestFinished(() => deleteTestUser(sender.id))
    const now = new Date()
    const oldId = v7({ msecs: now.getTime() - 40 * 86_400_000 })
    await withCommittedPostgresTransactionForTest(async query => {
      await ensureFederationReplayFloorForTest(query, 'outbound')
      await insertCompletedFederationReplayForTest(query, {
        activityId: oldId,
        sourceUserId: sender.id,
        completedAt: new Date(now.getTime() - 31 * 86_400_000),
      })
    })

    await withPostgresTransactionForTest(async query => {
      expect(
        await cleanupActivityPubReplayLedgerForTest('outbound', {
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
