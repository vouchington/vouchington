import { describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import {
  claimRecoverableDataRequests,
  createDataRequest,
  getDataRequestById,
} from '@services/account-data-requests'
import { accountLifecycle } from '@queues/account-lifecycle/queues'
import { createTestUser, makeUserDataRequestRecoverableForTest } from '@voucha/test-helpers'
import {
  ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB,
  ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB,
} from '@queues/background/enqueues/account-lifecycle-jobs'
import { recoverExportRequests } from './account-data-requests.mts'
import { processAccountDataRequestJob } from './account-data-request-job.mts'

describe('processAccountDataRequestJob', () => {
  it('rejects unknown jobs', async () => {
    await expect(processAccountDataRequestJob(job('unknown'))).rejects.toThrow(
      'Unknown job name: unknown',
    )
  })

  it('leaves legacy unfenced export jobs for database recovery', async () => {
    const user = await createTestUser()
    const request = await createDataRequest(user.id, user.id)

    await processAccountDataRequestJob(
      job(ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB.name, { requestId: request.id, userId: user.id }),
    )

    expect(await getDataRequestById(user.id, user.id, request.id)).toMatchObject({
      status: 'pending',
      last_error_message: null,
    })
  })

  it('routes a recovery job to the recovery sweep', async () => {
    const user = await createTestUser()
    const request = await createDataRequest(user.id, user.id)
    await makeUserDataRequestRecoverableForTest(request.id, 'unstarted')

    await processAccountDataRequestJob(job(ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB.name))

    const queued = await accountLifecycle.getJob(exportJobId(request))
    expect(queued?.data).toEqual({
      requestId: request.id,
      userId: user.id,
      processingAttemptId: request.processing_attempt_id,
    })
  })
})

describe('recoverExportRequests', () => {
  it('enqueues every claimed database attempt', async () => {
    const user = await createTestUser()
    const request = await createDataRequest(user.id, user.id)
    await makeUserDataRequestRecoverableForTest(request.id, 'unstarted')

    await expect(
      recoverExportRequests({
        claimRecoverableDataRequests: (_requestIds, batchSize) =>
          claimRecoverableDataRequests([request.id], batchSize),
      }),
    ).resolves.toEqual({ enqueued: 1, hasMore: false })

    const queued = await accountLifecycle.getJob(exportJobId(request))
    expect(queued?.data).toEqual({
      requestId: request.id,
      userId: user.id,
      processingAttemptId: request.processing_attempt_id,
    })
  })

  it('does not enqueue an empty recovery batch', async () => {
    const user = await createTestUser()
    const request = await createDataRequest(user.id, user.id)

    await expect(
      recoverExportRequests({
        claimRecoverableDataRequests: (_requestIds, batchSize) =>
          claimRecoverableDataRequests([request.id], batchSize),
      }),
    ).resolves.toEqual({ enqueued: 0, hasMore: false })

    expect(await accountLifecycle.getJob(exportJobId(request))).toBeNull()
  })
})

function exportJobId(request: { id: string; processing_attempt_id: string }): string {
  return `account-data-export__${request.id}__${request.processing_attempt_id}`
}

function job(name: string, data: Record<string, unknown> = {}): Job {
  return { name, data, attemptsMade: 2, opts: { attempts: 3 } } as Job
}
