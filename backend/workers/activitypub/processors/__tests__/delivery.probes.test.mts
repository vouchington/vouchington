import { describe, expect, it, onTestFinished } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createFederatedUser } from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import { deleteTestUser } from '@voucha/test-helpers/data-stores/psql/moderation-admission-relations'
import {
  insertUnfinishedDistributionForTest,
  createDistributionActivityIdForTest,
  readDistributionExpirationStateForTest,
} from '@voucha/test-helpers/activitypub-distribution-expiration'
import {
  withCapturedTestQueries,
  countCapturedQueriesByAnnotation,
} from '@voucha/test-helpers/query-capture'
import { withPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { cleanupActivityPubReplayLedgerForTest } from '@voucha/test-helpers/federation-retention-scopes'
import { getMaximumActivityAgeDays } from '@services/ap-inbox-activities/config'
import { distributeActivity } from '../delivery.mts'

const DAY_MS = 86_400_000

describe('rejected distribution checkpoint lifecycle', () => {
  it('terminalizes an aged leased checkpoint once and makes it eligible for bounded cleanup', async () => {
    const source = await createFederatedUser()
    const target = await createFederatedUser()
    onTestFinished(() => deleteTestUser(source.id))
    onTestFinished(() => deleteTestUser(target.id))
    const age = getMaximumActivityAgeDays()
    const id = createDistributionActivityIdForTest(new Date(Date.now() - (age + 1) * DAY_MS))
    const fixture = await insertUnfinishedDistributionForTest(id, source.id)
    const data = {
      activityId: id,
      activityType: 'Follow' as const,
      sourceUserId: source.id,
      targetUserId: target.id,
    }
    const captured = await withCapturedTestQueries(() => distributeActivity(data))
    expect(captured.result).toEqual({ enqueued: 0, reason: 'expired-activity' })
    expect(countCapturedQueriesByAnnotation(captured.queries, 'lockActivityPubReplayFloor')).toBe(0)
    const terminal = await readDistributionExpirationStateForTest(id)
    expect(terminal).toMatchObject({
      completed_at: expect.any(Date),
      cursor_remote_actor_id: fixture.cursor,
      attempt_count: 3,
      lease_token: null,
      leased_at: null,
      lease_expires_at: null,
    })
    await distributeActivity(data)
    expect(await readDistributionExpirationStateForTest(id)).toEqual(terminal)
    await withPostgresTransactionForTest(async query => {
      expect(
        await cleanupActivityPubReplayLedgerForTest('outbound', {
          batchSize: 1,
          maxBatches: 1,
          now: new Date(Date.now() + (age + 1) * DAY_MS),
          borrowedQuery: query,
          scope: { activityIds: [id] },
        }),
      ).toMatchObject({ deleted: 1, hasMore: false })
      expect(await readDistributionExpirationStateForTest(id, query)).toBeNull()
    })
  })

  it('does not insert missing IDs, retire wrong-source work, or terminalize a recent leased checkpoint', async () => {
    const source = await createFederatedUser()
    const target = await createFederatedUser()
    onTestFinished(() => deleteTestUser(source.id))
    onTestFinished(() => deleteTestUser(target.id))
    const oldId = createDistributionActivityIdForTest(
      new Date(Date.now() - (getMaximumActivityAgeDays() + 1) * DAY_MS),
    )
    const data = {
      activityId: oldId,
      activityType: 'Follow' as const,
      sourceUserId: source.id,
      targetUserId: target.id,
    }
    await distributeActivity(data)
    expect(await readDistributionExpirationStateForTest(oldId)).toBeNull()
    await insertUnfinishedDistributionForTest(oldId, target.id)
    const wrongSource = await readDistributionExpirationStateForTest(oldId)
    await distributeActivity(data)
    expect(await readDistributionExpirationStateForTest(oldId)).toEqual(wrongSource)
    const unsupported = randomUUID()
    expect(await distributeActivity({ ...data, activityId: unsupported })).toEqual({
      enqueued: 0,
      reason: 'unsupported-activity-id',
    })
    expect(await readDistributionExpirationStateForTest(unsupported)).toBeNull()
    const recent = createDistributionActivityIdForTest()
    await insertUnfinishedDistributionForTest(recent, source.id)
    const live = await readDistributionExpirationStateForTest(recent)
    await distributeActivity({ ...data, activityId: recent })
    expect(await readDistributionExpirationStateForTest(recent)).toEqual(live)
  })
})
