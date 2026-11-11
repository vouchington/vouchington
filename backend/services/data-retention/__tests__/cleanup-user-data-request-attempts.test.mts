import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  countDataRequestAttemptsForRetention,
  createDataRequestAttemptRetentionFixture,
} from '@voucha/test-helpers/account-data-request-attempt-retention'
import {
  createExactRetentionWindow,
  createIsolatedRetentionWindow,
} from '@voucha/test-helpers/retention-window'
import { cleanupExpiredUserDataRequestAttempts } from '../cleanup-user-data-request-attempts.mts'

describe('export attempt retention', () => {
  it('removes only terminal attempts after the S3 lifecycle and last upload lease', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const user = await createTestUser()
    const eligible = await createDataRequestAttemptRetentionFixture(user.id, {
      createdAt: at(49),
      terminalAt: at(40),
      attemptStartedAt: at(45),
      uploadLeaseExpiresAt: at(39),
    })
    const recent = await createDataRequestAttemptRetentionFixture(user.id, {
      createdAt: at(48),
      terminalAt: at(20),
      attemptStartedAt: at(45),
    })
    const leased = await createDataRequestAttemptRetentionFixture(user.id, {
      createdAt: at(47),
      terminalAt: at(40),
      attemptStartedAt: at(45),
      uploadLeaseExpiresAt: at(3),
    })
    const stored = await createDataRequestAttemptRetentionFixture(user.id, {
      createdAt: at(46),
      terminalAt: at(40),
      attemptStartedAt: at(45),
      s3Key: `${user.id}/stored.zip`,
    })
    const active = await createDataRequestAttemptRetentionFixture(user.id, {
      createdAt: at(45),
      terminalAt: null,
      attemptStartedAt: at(44),
    })
    const result = await cleanupExpiredUserDataRequestAttempts({
      now,
      lowerBoundDate,
      batchSize: 10,
      maxBatches: 5,
    })
    expect(result).toMatchObject({ deleted: 1, hasMore: false })
    expect(await countDataRequestAttemptsForRetention(eligible)).toBe(0)
    for (const requestId of [recent, leased, stored, active]) {
      expect(await countDataRequestAttemptsForRetention(requestId)).toBe(1)
    }
  })

  it('resumes its persisted composite UUIDv7 position on the next invocation', async () => {
    // Fixture ids are the minimum UUIDv7 of their createdAt, and the sweep's rows are only
    // those inside [lowerBoundDate, cutoff). A two-millisecond window cannot contain another
    // fixture's leftover rows, unlike a 120-day one that the shared database can land in.
    const { aged, now: windowNow, lowerBoundDate } = createExactRetentionWindow(30)
    const now = new Date(windowNow.getTime() + 1)
    const user = await createTestUser()
    const first = await createDataRequestAttemptRetentionFixture(user.id, {
      createdAt: aged,
      terminalAt: aged,
      attemptStartedAt: aged,
    })
    const second = await createDataRequestAttemptRetentionFixture(user.id, {
      createdAt: new Date(aged.getTime() + 1),
      terminalAt: aged,
      attemptStartedAt: aged,
    })
    const firstPage = await cleanupExpiredUserDataRequestAttempts({
      now,
      lowerBoundDate,
      batchSize: 10,
      maxBatches: 1,
    })
    expect(firstPage).toMatchObject({ deleted: 1, hasMore: true })
    expect(firstPage.continuation?.requestId).toBe(first)
    const secondPage = await cleanupExpiredUserDataRequestAttempts({
      now,
      lowerBoundDate,
      batchSize: 10,
      maxBatches: 1,
    })
    expect(secondPage).toMatchObject({ deleted: 1, hasMore: false, continuation: null })
    expect(await countDataRequestAttemptsForRetention(second)).toBe(0)
  })
})
