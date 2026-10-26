import { describe, expect, it, onTestFinished } from 'vitest'
import {
  acquireModerationOperationRetentionTestLock,
  createTestExpiryWindow,
  createTestUser,
  insertTestModerationReport,
  insertTestModeratorAction,
} from '@voucha/test-helpers'
import { resolveTestRetentionReport } from '@voucha/test-helpers/entities/moderation-retention'
import {
  deleteTestRetentionReports,
  testRetentionReportExists,
} from '@voucha/test-helpers/entities/moderation-retention-continuation'
import { cleanupModerationRecords } from './cleanup-moderation-records.mts'

describe('moderation cleanup continuation', () => {
  it('continues past protected rows without restarting completed families and then converges', async () => {
    const lock = await acquireModerationOperationRetentionTestLock()
    onTestFinished(() => lock.release())
    const window = createTestExpiryWindow()
    const now = new Date(window.upperBoundDate)
    now.setUTCFullYear(now.getUTCFullYear() + 3)
    const staff = await createTestUser()
    const protectedTarget = await createTestUser()
    const expiredTarget = await createTestUser()
    const protectedId = await insertTestModerationReport({
      reporterUserId: staff.id,
      entityType: 'user',
      entityId: protectedTarget.id,
      createdAt: window.firstEligibleDate,
    })
    const expiredId = await insertTestModerationReport({
      reporterUserId: staff.id,
      entityType: 'user',
      entityId: expiredTarget.id,
      createdAt: window.secondEligibleDate,
    })
    onTestFinished(() => deleteTestRetentionReports([protectedId, expiredId]))
    await resolveTestRetentionReport(expiredId, window.secondEligibleDate)
    const options = {
      batchSize: 1,
      maxBatches: 1,
      now,
      lowerBoundDate: window.lowerBoundDate,
      upperBoundDate: window.upperBoundDate,
    }
    const first = await cleanupModerationRecords(options)
    expect(first).toEqual({ deleted: 0, hasMore: true, remainingKinds: ['reports'] })
    await insertTestModeratorAction({
      actorId: staff.id,
      actionType: 'pin',
      occurredAt: window.firstEligibleDate,
    })
    const second = await cleanupModerationRecords({ ...options, kinds: first.remainingKinds })
    expect(second).toEqual({ deleted: 1, hasMore: false, remainingKinds: [] })
    expect(await testRetentionReportExists(protectedId)).toBe(true)
    expect(await testRetentionReportExists(expiredId)).toBe(false)
    expect(await cleanupModerationRecords({ ...options, kinds: second.remainingKinds })).toEqual({
      deleted: 0,
      hasMore: false,
      remainingKinds: [],
    })
    expect(await cleanupModerationRecords({ ...options, kinds: ['reports', 'actions'] })).toEqual({
      deleted: 1,
      hasMore: false,
      remainingKinds: [],
    })
  })
})
