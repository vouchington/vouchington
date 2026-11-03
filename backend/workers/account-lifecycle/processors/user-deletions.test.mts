import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { claimRecoverableUserDeletions, createUserDeletionRequest } from '@services/user-deletions'
import { accountLifecycle } from '@queues/account-lifecycle/queues'
import { createTestUser } from '@voucha/test-helpers'
import { rejectNextPostgresTransactionForTest } from '@voucha/test-helpers/injected-failures'
import {
  getUserDeletionRequestForTest,
  makeUserDeletionRecoverableForTest,
} from '@voucha/test-helpers/services/user-deletions/user-deletion-lifecycle'
import {
  ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB,
  ACCOUNT_LIFECYCLE_USER_DELETION_JOB,
} from '@queues/background/enqueues/account-lifecycle-jobs'
import { processUserDeletionJob } from './user-deletion-job.mts'
import { processUserDeletion, recoverUserDeletions } from './user-deletions.mts'

describe('user-deletions processor', () => {
  it('routes a fenced process job with its request and processing attempt', async () => {
    const processDeletion = vi.fn<typeof processUserDeletion>()
    const recoverDeletions = vi.fn<typeof recoverUserDeletions>()

    await processUserDeletionJob(
      job(ACCOUNT_LIFECYCLE_USER_DELETION_JOB.name, {
        requestId: 'request-1',
        processingAttemptId: 'attempt-1',
      }),
      {
        processUserDeletion: processDeletion,
        recoverUserDeletions: recoverDeletions,
      },
    )

    expect(processDeletion).toHaveBeenCalledOnce()
    expect(processDeletion).toHaveBeenCalledWith('request-1', 'attempt-1', {
      isFinalAttempt: false,
    })
    expect(recoverDeletions).not.toHaveBeenCalled()
  })

  it('passes the final job attempt to the deletion lifecycle', async () => {
    const processDeletion = vi.fn<typeof processUserDeletion>()
    const recoverDeletions = vi.fn<typeof recoverUserDeletions>()

    await processUserDeletionJob(
      job(
        ACCOUNT_LIFECYCLE_USER_DELETION_JOB.name,
        { requestId: 'request-1', processingAttemptId: 'attempt-1' },
        2,
        3,
      ),
      {
        processUserDeletion: processDeletion,
        recoverUserDeletions: recoverDeletions,
      },
    )

    expect(processDeletion).toHaveBeenCalledWith('request-1', 'attempt-1', {
      isFinalAttempt: true,
    })
  })

  it('treats a missing attempt limit as a final attempt', async () => {
    const processDeletion = vi.fn<typeof processUserDeletion>()
    const jobWithoutAttemptLimit = job(ACCOUNT_LIFECYCLE_USER_DELETION_JOB.name, {
      requestId: 'request-1',
      processingAttemptId: 'attempt-1',
    })
    delete jobWithoutAttemptLimit.opts.attempts

    await processUserDeletionJob(jobWithoutAttemptLimit, {
      processUserDeletion: processDeletion,
      recoverUserDeletions: vi.fn<typeof recoverUserDeletions>(),
    })

    expect(processDeletion).toHaveBeenCalledWith('request-1', 'attempt-1', {
      isFinalAttempt: true,
    })
  })

  it.each([
    ['request ID', { processingAttemptId: 'attempt-1' }],
    ['processing attempt ID', { requestId: 'request-1' }],
  ])('leaves a process job missing its %s for recovery', async (_missingFence, data) => {
    const processDeletion = vi.fn<typeof processUserDeletion>()
    const recoverDeletions = vi.fn<typeof recoverUserDeletions>()

    await processUserDeletionJob(job(ACCOUNT_LIFECYCLE_USER_DELETION_JOB.name, data), {
      processUserDeletion: processDeletion,
      recoverUserDeletions: recoverDeletions,
    })

    expect(processDeletion).not.toHaveBeenCalled()
    expect(recoverDeletions).not.toHaveBeenCalled()
  })

  it('routes recovery jobs', async () => {
    const processDeletion = vi.fn<typeof processUserDeletion>()
    const recoverDeletions = vi.fn<typeof recoverUserDeletions>()

    await processUserDeletionJob(job(ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB.name), {
      processUserDeletion: processDeletion,
      recoverUserDeletions: recoverDeletions,
    })

    expect(recoverDeletions).toHaveBeenCalledOnce()
    expect(processDeletion).not.toHaveBeenCalled()
  })

  it('processes one fenced deletion batch and enqueues its successor attempt', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)

    await processUserDeletion(request.id, request.processingAttemptId, { isFinalAttempt: true })

    const advanced = await getUserDeletionRequestForTest(request.id)
    expect(advanced?.processingAttempts).toBe(1)
    expect(advanced?.currentPhase).toBe('votes')
    expect(advanced?.processingAttemptId).not.toBe(request.processingAttemptId)
    const successor = await accountLifecycle.getJob(
      `user-deletion__${request.id}__${advanced?.processingAttemptId}`,
    )
    expect(successor?.data).toEqual({
      requestId: request.id,
      processingAttemptId: advanced?.processingAttemptId,
    })
  })

  it('rotates the processing attempt when the failed attempt is final', async () => {
    const { request, released } = await failFirstTransaction(true)
    expect(released?.processingAttemptId).not.toBe(request.processingAttemptId)
  })

  it('keeps the processing attempt when the failed attempt is not final', async () => {
    const { request, released } = await failFirstTransaction(false)
    expect(released?.processingAttemptId).toBe(request.processingAttemptId)
  })

  it('recovers durable requests and enqueues their recoverable attempts', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await makeUserDeletionRecoverableForTest(request.id, 'unstarted')

    await expect(
      recoverUserDeletions({
        claimRecoverableUserDeletions: () => claimRecoverableUserDeletions([request.id]),
      }),
    ).resolves.toEqual({ enqueued: 1 })

    const queued = await accountLifecycle.getJob(
      `user-deletion__${request.id}__${request.processingAttemptId}`,
    )
    expect(queued?.data).toEqual({
      requestId: request.id,
      processingAttemptId: request.processingAttemptId,
    })
  })

  it('rejects unknown job names', async () => {
    await expect(
      processUserDeletionJob(job('unknown'), {
        processUserDeletion: vi.fn<typeof processUserDeletion>(),
        recoverUserDeletions: vi.fn<typeof recoverUserDeletions>(),
      }),
    ).rejects.toThrow('Unknown job name: unknown')
  })
})

function job(
  name: string,
  data: Record<string, unknown> = {},
  attemptsMade = 0,
  attempts = 3,
): Job {
  return { name, data, attemptsMade, opts: { attempts } } as Job
}

async function failFirstTransaction(isFinalAttempt: boolean) {
  const user = await createTestUser()
  const request = await createUserDeletionRequest(user.id, user.id)
  onTestFinished(rejectNextPostgresTransactionForTest(new Error('provider unavailable')))

  await expect(
    processUserDeletion(request.id, request.processingAttemptId, { isFinalAttempt }),
  ).rejects.toThrow('provider unavailable')

  return { request, released: await getUserDeletionRequestForTest(request.id) }
}
