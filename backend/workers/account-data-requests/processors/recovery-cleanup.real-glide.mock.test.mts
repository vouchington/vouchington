import { describe, expect, it, vi } from 'vitest'
import { enqueueExportRequest } from '@queues/account-data-requests/enqueues'
import { accountDataRequests } from '@queues/account-data-requests/queues'
import {
  claimRecoverableDataRequests,
  createDataRequest,
  markDataRequestProcessing,
} from '@services/account-data-requests'
import { createTestUser, makeUserDataRequestRecoverableForTest } from '@voucha/test-helpers'
import { recoverExportRequests } from './recovery-cleanup.mts'

// The dedicated backend-real-glide-mq project routes only .real-glide.mock.test.mts files, and
// retained-record behavior is a property of the real GlideMQ transport, not the in-memory shim.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('account data export recovery with a retained failed job under the attempt token', () => {
  it('re-dispatches the unstarted attempt so its job claims the token', async () => {
    const user = await createTestUser()
    const request = await createDataRequest(user.id, user.id)
    const attempt = {
      requestId: request.id,
      userId: user.id,
      processingAttemptId: request.processing_attempt_id,
    }
    const jobId = `account-data-export__${attempt.requestId}__${attempt.processingAttemptId}`

    try {
      await enqueueExportRequest(attempt.requestId, attempt.userId, attempt.processingAttemptId)
      // A job that stalls past its limit, or fails before it claims the token, leaves exactly this.
      await expect(accountDataRequests.revoke(jobId)).resolves.toBe('revoked')
      await expect((await accountDataRequests.getJob(jobId))?.getState()).resolves.toBe('failed')
      await makeUserDataRequestRecoverableForTest(request.id, 'unstarted')

      await recoverExportRequests({
        claimRecoverableDataRequests: (_requestIds, batchSize) =>
          claimRecoverableDataRequests([request.id], batchSize),
      })

      const redispatched = await accountDataRequests.getJob(jobId)
      if (!redispatched) throw new Error('Expected recovery to dispatch the attempt again')
      await expect(redispatched.getState()).resolves.not.toMatch(/^(completed|failed)$/)
      expect(redispatched.data).toEqual(attempt)

      // The first step of the export processor, with the token the re-dispatched job carries.
      await expect(
        markDataRequestProcessing(attempt.requestId, attempt.processingAttemptId),
      ).resolves.toBe(true)
    } finally {
      await (await accountDataRequests.getJob(jobId))?.remove()
    }
  })
})
