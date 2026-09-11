import { describe, expect, it } from 'vitest'
import {
  clearUserDataRequestExpiryForTest,
  createTestUser,
  expireUserDataRequestForTest,
  flushPendingTasks,
  getTestDataRequestAttemptFence,
  getUserDataRequestStatusAndS3KeyForTest,
  restoreUser,
  softDeleteUser,
  startPausedTestUserSoftDeletion,
} from '@voucha/test-helpers'
import {
  createDataRequest,
  markDataRequestProcessing,
  leaseDataRequestUpload,
  markDataRequestFailed,
  markDataRequestReady,
  expireDataRequests,
} from './index.mts'
describe('expireDataRequests', () => {
  it('reclaims s3_keys from already-expired requests with leftover s3_key', async () => {
    const user = await createTestUser()
    expect(user).toBeDefined()

    const request = await createDataRequest(user!.id)
    const started = await markDataRequestProcessing(request.id)
    expect(started).toBe(true)

    const orphanedS3Key = `orphaned-export-${Math.random().toString(36).slice(2, 10)}.zip`
    const saved = await markDataRequestReady(
      request.id,
      orphanedS3Key,
      new Date(Date.now() + 60_000),
    )
    expect(saved).toBe(true)

    await expireUserDataRequestForTest(request.id)

    const s3Keys = await expireDataRequests()
    expect(s3Keys).toContain(orphanedS3Key)

    const row = await getUserDataRequestStatusAndS3KeyForTest(request.id)
    if (!row) throw new Error('Expected user_data_requests row to exist')
    expect(row.status).toBe('expired')
    expect(row.s3_key).toBeNull()
  })

  it('does not reclaim ready requests with no expiry deadline', async () => {
    const user = await createTestUser()
    expect(user).toBeDefined()

    const request = await createDataRequest(user!.id)
    expect(await markDataRequestProcessing(request.id)).toBe(true)

    const indefiniteS3Key = `indefinite-export-${Math.random().toString(36).slice(2, 10)}.zip`
    expect(
      await markDataRequestReady(request.id, indefiniteS3Key, new Date(Date.now() + 60_000)),
    ).toBe(true)
    await clearUserDataRequestExpiryForTest(request.id)

    const s3Keys = await expireDataRequests()
    expect(s3Keys).not.toContain(indefiniteS3Key)

    const row = await getUserDataRequestStatusAndS3KeyForTest(request.id)
    if (!row) throw new Error('Expected user_data_requests row to exist')
    expect(row.status).toBe('ready')
    expect(row.s3_key).toBe(indefiniteS3Key)
  })
})

describe('markDataRequestFailed', () => {
  it('returns true on first failure and false on retry', async () => {
    const user = await createTestUser()
    const request = await createDataRequest(user!.id)
    expect(await markDataRequestFailed(request.id)).toBe(true)
    expect(await markDataRequestFailed(request.id)).toBe(false)
  })
})

describe('markDataRequestProcessing', () => {
  it('records an attempt ledger row for a processing claim', async () => {
    const user = await createTestUser()
    const request = await createDataRequest(user.id)

    expect(await markDataRequestProcessing(request.id, request.processing_attempt_id)).toBe(true)

    await expect(getTestDataRequestAttemptFence(request.id)).resolves.toEqual({
      upload_lease_expires_at: null,
    })
  })

  it('does not restart a failed request', async () => {
    const user = await createTestUser()
    expect(user).toBeDefined()

    const request = await createDataRequest(user!.id)

    const started = await markDataRequestProcessing(request.id)
    expect(started).toBe(true)

    expect(await markDataRequestFailed(request.id)).toBe(true)

    const retried = await markDataRequestProcessing(request.id)
    expect(retried).toBe(false)
  })

  it('does not claim an export after its owner is deleted', async () => {
    const user = await createTestUser()
    const request = await createDataRequest(user.id)
    try {
      await softDeleteUser(user.id)
      expect(await markDataRequestProcessing(request.id)).toBe(false)
    } finally {
      await restoreUser(user.id)
    }
  })

  it('does not acquire a provider-effect lease after its owner is deleted', async () => {
    const user = await createTestUser()
    const request = await createDataRequest(user.id)
    expect(await markDataRequestProcessing(request.id, request.processing_attempt_id)).toBe(true)
    try {
      await softDeleteUser(user.id)
      await expect(
        leaseDataRequestUpload(request.id, request.processing_attempt_id),
      ).resolves.toBeNull()
    } finally {
      await restoreUser(user.id)
    }
  })

  it('waits for an in-progress deletion before deciding whether it can claim an export', async () => {
    const user = await createTestUser()
    const request = await createDataRequest(user.id)
    const deletion = await startPausedTestUserSoftDeletion(user.id)
    const claim = markDataRequestProcessing(request.id)
    try {
      await flushPendingTasks()
      const row = await getUserDataRequestStatusAndS3KeyForTest(request.id)
      expect(row?.status).toBe('pending')
      deletion.release()
      await deletion.completed
      await expect(claim).resolves.toBe(false)
    } finally {
      deletion.release()
      await deletion.completed
      await restoreUser(user.id)
    }
  })
})
