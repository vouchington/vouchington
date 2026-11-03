import { describe, expect, it, onTestFinished } from 'vitest'
import type { Job } from 'glide-mq'
import { claimRecoverableUserDeletions, createUserDeletionRequest } from '@services/user-deletions'
import { accountLifecycle } from '@queues/account-lifecycle/queues'
import { createTestUser } from '@voucha/test-helpers'
import {
  rejectNextPostgresTransactionForTest,
  rejectPostgresWriteForTest,
} from '@voucha/test-helpers/injected-failures'
import {
  getUserDeletionRequestForTest,
  makeUserDeletionRecoverableForTest,
} from '@voucha/test-helpers/services/user-deletions/user-deletion-lifecycle'
import {
  ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB,
  ACCOUNT_LIFECYCLE_USER_DELETION_JOB,
} from '@queues/background/enqueues/account-lifecycle-jobs'
import { processUserDeletionJob } from './user-deletion-job.mts'
import { recoverUserDeletions } from './user-deletions.mts'

describe('user-deletions processor', () => {
  it('routes a fenced process job to one deletion batch and enqueues its successor attempt', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)

    await processUserDeletionJob(deletionJob(request))

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

  it('rotates the processing attempt when the failed job attempt is final', async () => {
    const { request, released } = await failFirstTransaction(2)
    expect(released?.processingAttemptId).not.toBe(request.processingAttemptId)
  })

  it('keeps the processing attempt when the failed job attempt is not final', async () => {
    const { request, released } = await failFirstTransaction(0)
    expect(released?.processingAttemptId).toBe(request.processingAttemptId)
  })

  it('treats a missing attempt limit as a final attempt', async () => {
    const { request, released } = await failFirstTransaction(0, { withoutAttemptLimit: true })
    expect(released?.processingAttemptId).not.toBe(request.processingAttemptId)
  })

  it.each([
    [
      'request ID',
      (request: DeletionAttempt) => ({ processingAttemptId: request.processingAttemptId }),
    ],
    ['processing attempt ID', (request: DeletionAttempt) => ({ requestId: request.id })],
  ])('leaves a process job missing its %s for recovery', async (_missingFence, dataFor) => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)

    await processUserDeletionJob(job(ACCOUNT_LIFECYCLE_USER_DELETION_JOB.name, dataFor(request)))

    const untouched = await getUserDeletionRequestForTest(request.id)
    expect(untouched?.processingAttempts).toBe(0)
    expect(untouched?.processingAttemptId).toBe(request.processingAttemptId)
  })

  it('routes a recovery job to the recovery sweep', async () => {
    onTestFinished(
      rejectPostgresWriteForTest(
        'claimRecoverableUserDeletions',
        new Error('recovery sweep reached'),
      ),
    )

    await expect(
      processUserDeletionJob(job(ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB.name)),
    ).rejects.toThrow('recovery sweep reached')
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
    await expect(processUserDeletionJob(job('unknown'))).rejects.toThrow(
      'Unknown job name: unknown',
    )
  })
})

type DeletionAttempt = { id: string; processingAttemptId: string }

function job(
  name: string,
  data: Record<string, unknown> = {},
  attemptsMade = 0,
  attempts = 3,
): Job {
  return { name, data, attemptsMade, opts: { attempts } } as Job
}

function deletionJob(request: DeletionAttempt, attemptsMade = 0): Job {
  return job(
    ACCOUNT_LIFECYCLE_USER_DELETION_JOB.name,
    { requestId: request.id, processingAttemptId: request.processingAttemptId },
    attemptsMade,
  )
}

async function failFirstTransaction(
  attemptsMade: number,
  options: { withoutAttemptLimit?: boolean } = {},
) {
  const user = await createTestUser()
  const request = await createUserDeletionRequest(user.id, user.id)
  onTestFinished(rejectNextPostgresTransactionForTest(new Error('provider unavailable')))
  const queued = deletionJob(request, attemptsMade)
  if (options.withoutAttemptLimit) delete queued.opts.attempts

  await expect(processUserDeletionJob(queued)).rejects.toThrow('provider unavailable')

  return { request, released: await getUserDeletionRequestForTest(request.id) }
}
