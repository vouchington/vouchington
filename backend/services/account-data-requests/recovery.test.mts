import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  makeUserDataRequestRecoverableForTest,
  restoreUser,
  softDeleteUser,
} from '@voucha/test-helpers'
import { createDataRequest } from './create.mts'
import { claimRecoverableDataRequests } from './recovery.mts'
import {
  markDataRequestProcessing,
  markDataRequestReady,
  markDataRequestFailed,
} from './update.mts'

describe('account data request recovery', () => {
  it('reuses the token for an unstarted attempt and rotates stale attempts', async () => {
    const user = await createTestUser()
    const request = await createDataRequest(user.id)
    await makeUserDataRequestRecoverableForTest(request.id, 'unstarted')
    const unstarted = (await claimRecoverableDataRequests()).find(
      candidate => candidate.requestId === request.id,
    )
    expect(unstarted?.processingAttemptId).toBe(request.processing_attempt_id)

    await makeUserDataRequestRecoverableForTest(request.id, 'stale')
    const stale = (await claimRecoverableDataRequests()).find(
      candidate => candidate.requestId === request.id,
    )
    expect(stale?.processingAttemptId).not.toBe(request.processing_attempt_id)
  })

  it('fences stale completion and failure writes by processing attempt id', async () => {
    const user = await createTestUser()
    const request = await createDataRequest(user.id)
    const staleAttemptId = request.id
    expect(await markDataRequestProcessing(request.id, staleAttemptId)).toBe(false)
    expect(await markDataRequestProcessing(request.id, request.processing_attempt_id)).toBe(true)
    expect(
      await markDataRequestReady(
        request.id,
        'stale.zip',
        new Date(Date.now() + 60_000),
        staleAttemptId,
      ),
    ).toBe(false)
    expect(await markDataRequestFailed(request.id, staleAttemptId, 'stale failure', true)).toBe(
      false,
    )
  })

  it('does not recover an export after its owner is deleted', async () => {
    const user = await createTestUser()
    const request = await createDataRequest(user.id)
    await makeUserDataRequestRecoverableForTest(request.id, 'unstarted')
    try {
      await softDeleteUser(user.id)
      const recovered = await claimRecoverableDataRequests()
      expect(recovered.some(candidate => candidate.requestId === request.id)).toBe(false)
    } finally {
      await restoreUser(user.id)
    }
  })
})
