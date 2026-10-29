import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { DELETED_USER_ID } from '@services/users/constants'
import {
  attemptYoungReleasedHoldDeletion,
  createTestCompletedDeletionProof,
  createTestIdentityVerificationAttempt,
  createTestReleasedLegalHold,
  legalRecordExists,
} from '@voucha/test-helpers/entities/legal-retention'
import { cleanupLegalRecords } from './cleanup-legal-records.mts'

describe('legal record retention', () => {
  it('expires completed deletion proof and released holds after three years', async () => {
    const now = new Date('2026-10-23T12:00:00.000Z')
    const expiredAt = new Date('2023-10-22T12:00:00.000Z')
    const recentAt = new Date('2023-10-24T12:00:00.000Z')
    const expiredRequestId = await createTestCompletedDeletionProof(expiredAt)
    const recentRequestId = await createTestCompletedDeletionProof(recentAt)
    const expiredHoldId = await createTestReleasedLegalHold(expiredAt)
    const recentHoldId = await createTestReleasedLegalHold(recentAt)
    const youngGuardId = await createTestReleasedLegalHold(new Date())
    await expect(attemptYoungReleasedHoldDeletion(youngGuardId)).rejects.toThrow(
      /legal preservation holds are retained/,
    )
    const result = await cleanupLegalRecords({ batchSize: 4, maxBatches: 1 }, now, [
      expiredRequestId,
      recentRequestId,
      expiredHoldId,
      recentHoldId,
    ])
    expect(result).toContainEqual({
      family: 'user_deletion_request',
      scanned: 2,
      deleted: 1,
      hasMore: false,
    })
    expect(result).toContainEqual({
      family: 'user_legal_preservation_hold',
      scanned: 2,
      deleted: 1,
      hasMore: false,
    })
    expect(await legalRecordExists('user_deletion_requests', expiredRequestId)).toBe(false)
    expect(await legalRecordExists('user_deletion_requests', recentRequestId)).toBe(true)
    expect(await legalRecordExists('user_legal_preservation_holds', expiredHoldId)).toBe(false)
    expect(await legalRecordExists('user_legal_preservation_holds', recentHoldId)).toBe(true)
  })

  it('honors the February 29 calendar-year anniversary', async () => {
    const now = new Date('2023-02-28T12:00:00.000Z')
    const leapDay = new Date('2020-02-29T12:00:00.000Z')
    const nextDay = new Date('2020-03-01T12:00:00.000Z')
    const expiredRequestId = await createTestCompletedDeletionProof(leapDay)
    const youngRequestId = await createTestCompletedDeletionProof(nextDay)
    const expiredHoldId = await createTestReleasedLegalHold(leapDay)
    const youngHoldId = await createTestReleasedLegalHold(nextDay)
    await cleanupLegalRecords({ batchSize: 4, maxBatches: 1 }, now, [
      expiredRequestId,
      youngRequestId,
      expiredHoldId,
      youngHoldId,
    ])
    expect(await legalRecordExists('user_deletion_requests', expiredRequestId)).toBe(false)
    expect(await legalRecordExists('user_deletion_requests', youngRequestId)).toBe(true)
    expect(await legalRecordExists('user_legal_preservation_holds', expiredHoldId)).toBe(false)
    expect(await legalRecordExists('user_legal_preservation_holds', youngHoldId)).toBe(true)
  })

  it('expires only seven-year-old attempts attached to the deleted-user tombstone', async () => {
    const now = new Date('2026-10-23T12:00:00.000Z')
    const expiredAt = new Date('2019-10-22T12:00:00.000Z')
    const boundaryAt = new Date('2019-10-23T12:00:00.000Z')
    const recentAt = new Date('2019-10-24T12:00:00.000Z')
    const expiredId = await createTestIdentityVerificationAttempt(DELETED_USER_ID, expiredAt)
    const boundaryId = await createTestIdentityVerificationAttempt(DELETED_USER_ID, boundaryAt)
    const recentId = await createTestIdentityVerificationAttempt(DELETED_USER_ID, recentAt)
    const liveUser = await createTestUserDirect()
    const liveId = await createTestIdentityVerificationAttempt(liveUser.id, expiredAt)

    const result = await cleanupLegalRecords({ batchSize: 4, maxBatches: 1 }, now, [
      expiredId,
      boundaryId,
      recentId,
      liveId,
    ])
    expect(result).toContainEqual({
      family: 'identity_verification_attempt',
      scanned: 4,
      deleted: 2,
      hasMore: false,
    })
    await expect(legalRecordExists('identity_verification_attempts', expiredId)).resolves.toBe(
      false,
    )
    await expect(legalRecordExists('identity_verification_attempts', boundaryId)).resolves.toBe(
      false,
    )
    await expect(legalRecordExists('identity_verification_attempts', recentId)).resolves.toBe(true)
    await expect(legalRecordExists('identity_verification_attempts', liveId)).resolves.toBe(true)
  })
})
