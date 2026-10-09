import { describe, expect, it, vi } from 'vitest'
import { enqueueUserDeletion, userDeletionJobId } from '@queues/user-deletions/enqueues'
import { userDeletions } from '@queues/user-deletions/queues'
import { createUserDeletionRequest } from '@services/user-deletions'
import { createTestUser } from '@voucha/test-helpers'
import {
  getUserDeletionDispatchedAtForTest,
  getUserDeletionRequestForTest,
  makeUserDeletionRecoverableForTest,
} from '@voucha/test-helpers/services/user-deletions/lifecycle.test-support'
import { processUserDeletionJob } from './processors/process-job.mts'
import { recoverUserDeletions } from './processors.mts'

// The dedicated backend-real-glide-mq project routes only .real-glide.mock.test.mts files, and
// retained-record behavior is a property of the real GlideMQ transport, not the in-memory shim.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('user deletion recovery with a retained failed job under the attempt token', () => {
  it('re-dispatches the unstarted attempt so its job runs and claims the token', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    const attempt = { requestId: request.id, processingAttemptId: request.processingAttemptId }
    const jobId = userDeletionJobId(attempt)
    let successorJobId: string | undefined

    try {
      await enqueueUserDeletion(attempt)
      // A job that stalls past its limit, or fails before it claims the token, leaves exactly this.
      await expect(userDeletions.revoke(jobId)).resolves.toBe('revoked')
      await expect((await userDeletions.getJob(jobId))?.getState()).resolves.toBe('failed')
      await makeUserDeletionRecoverableForTest(request.id, 'unstarted')

      await recoverUserDeletions()

      const redispatched = await userDeletions.getJob(jobId)
      if (!redispatched) throw new Error('Expected recovery to dispatch the attempt again')
      await expect(redispatched.getState()).resolves.not.toMatch(/^(completed|failed)$/)
      expect(redispatched.data).toEqual(attempt)

      await processUserDeletionJob(redispatched)

      const claimed = await getUserDeletionRequestForTest(request.id)
      expect(claimed?.processingAttempts).toBe(1)
      if (claimed) {
        successorJobId = userDeletionJobId({
          requestId: request.id,
          processingAttemptId: claimed.processingAttemptId,
        })
      }
    } finally {
      await Promise.all(
        [jobId, successorJobId].map(async id =>
          id ? (await userDeletions.getJob(id))?.remove() : undefined,
        ),
      )
    }
  })

  it('keeps a still-queued delayed job as the canonical delivery of its token', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    const attempt = { requestId: request.id, processingAttemptId: request.processingAttemptId }
    const jobId = userDeletionJobId(attempt)

    try {
      await enqueueUserDeletion({ ...attempt, delayMs: 3_600_000 })
      const queued = await userDeletions.getJob(jobId)
      await expect(queued?.getState()).resolves.toBe('delayed')
      await makeUserDeletionRecoverableForTest(request.id, 'unstarted')
      const staleDispatchedAt = await getUserDeletionDispatchedAtForTest(request.id)

      await recoverUserDeletions()

      // Recovery claimed the request, so it considered this exact token and left the job alone.
      const dispatchedAt = await getUserDeletionDispatchedAtForTest(request.id)
      expect(dispatchedAt?.getTime()).toBeGreaterThan(staleDispatchedAt?.getTime() ?? Infinity)
      const after = await userDeletions.getJob(jobId)
      await expect(after?.getState()).resolves.toBe('delayed')
      expect(after?.timestamp).toBe(queued?.timestamp)
      expect(after?.opts.delay).toBe(3_600_000)
    } finally {
      await (await userDeletions.getJob(jobId))?.remove()
    }
  })
})
