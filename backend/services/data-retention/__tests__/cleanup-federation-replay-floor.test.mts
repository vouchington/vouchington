import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  advanceFederationReplayFloorForTest,
  ensureFederationReplayFloorForTest,
  insertFederationInboxReplayForTest,
  isReplayFloorLockedForTest,
  readFederationReplayFloorForTest,
} from '@voucha/test-helpers'
import {
  withCommittedPostgresTransactionForTest,
  withPostgresTransactionForTest,
} from '@voucha/test-helpers/postgres-transaction'
import { cleanupActivityPubReplayLedgerForTest } from '@voucha/test-helpers/federation-retention-scopes'
import { advanceReplayRejectionFloor } from '../cleanup-activitypub-replay-floor.mts'

describe('replay floor', () => {
  it('uses the latest deleted inbox receipt regardless of return order', async () => {
    const latest = new Date('2100-01-02T00:00:00.000Z')
    const older = new Date('2100-01-01T00:00:00.000Z')
    await withPostgresTransactionForTest(async query => {
      await advanceFederationReplayFloorForTest(query, older)
      await advanceReplayRejectionFloor(query, [
        { at: latest.toISOString() },
        { at: older.toISOString() },
      ])
      expect(await readFederationReplayFloorForTest(query)).toEqual(
        new Date(latest.getTime() + 3_600_000),
      )
    })
  })

  it('keeps the floor on an empty page and advances it only through a deleted partial page', async () => {
    const now = new Date()
    const oldAt = new Date(now.getTime() - 400 * 86_400_000)
    const firstId = v7({ msecs: oldAt.getTime() })
    const secondId = v7({ msecs: oldAt.getTime() + 1 })
    await withPostgresTransactionForTest(async query => {
      await advanceFederationReplayFloorForTest(query, new Date(oldAt.getTime() - 1))
      const initialFloor = await readFederationReplayFloorForTest(query)
      expect(
        await cleanupActivityPubReplayLedgerForTest({
          batchSize: 1,
          maxBatches: 1,
          now,
          borrowedQuery: query,
          scope: { activityIds: [firstId, secondId] },
        }),
      ).toEqual({ deleted: 0, hasMore: false, continuationPosition: null })
      expect(await readFederationReplayFloorForTest(query)).toEqual(initialFloor)
      await insertFederationInboxReplayForTest(query, { id: firstId, receivedAt: oldAt })
      await insertFederationInboxReplayForTest(query, { id: secondId, receivedAt: oldAt })
      expect(
        await cleanupActivityPubReplayLedgerForTest({
          batchSize: 1,
          maxBatches: 1,
          now,
          borrowedQuery: query,
          scope: { activityIds: [firstId, secondId] },
        }),
      ).toMatchObject({ deleted: 1, hasMore: true })
      expect(await readFederationReplayFloorForTest(query)).toEqual(
        new Date(oldAt.getTime() + 3_600_000),
      )
    })
  })

  it('holds the replay-floor row lock through an uncommitted purge', async () => {
    const now = new Date()
    const oldAt = new Date(now.getTime() - 400 * 86_400_000)
    const oldId = v7({ msecs: oldAt.getTime() })
    await withCommittedPostgresTransactionForTest(async query => {
      await ensureFederationReplayFloorForTest(query)
      await insertFederationInboxReplayForTest(query, { id: oldId, receivedAt: oldAt })
    })

    await withPostgresTransactionForTest(async query => {
      expect(
        await cleanupActivityPubReplayLedgerForTest({
          batchSize: 1,
          maxBatches: 1,
          now,
          borrowedQuery: query,
          scope: { activityIds: [oldId] },
        }),
      ).toMatchObject({ deleted: 1, hasMore: false })
      expect(await isReplayFloorLockedForTest()).toBe(true)
    })
  })
})
