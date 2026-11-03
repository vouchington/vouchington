import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { claimRecoverableDataRequests, createDataRequest } from '@services/account-data-requests'
import { accountLifecycle } from '@queues/account-lifecycle/queues'
import { createTestUser, makeUserDataRequestRecoverableForTest } from '@voucha/test-helpers'
import {
  ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB,
  ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB,
  ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB,
} from '@queues/background/enqueues/account-lifecycle-jobs'
import {
  type processCleanupExpiredExports,
  type processExportRequest,
  recoverExportRequests,
} from './account-data-requests.mts'
import { processAccountDataRequestJob } from './account-data-request-job.mts'

describe('processAccountDataRequestJob', () => {
  it('routes export, cleanup, and recovery jobs', async () => {
    const processors = {
      processCleanupExpiredExports: vi.fn<typeof processCleanupExpiredExports>(),
      processExportRequest: vi.fn<typeof processExportRequest>(),
      recoverExportRequests: vi.fn<typeof recoverExportRequests>(),
    }

    await processAccountDataRequestJob(
      job(ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB.name, {
        requestId: 'request-1',
        userId: 'user-1',
        processingAttemptId: 'attempt-1',
      }),
      processors,
    )
    await processAccountDataRequestJob(job(ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB.name), processors)
    await processAccountDataRequestJob(job(ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB.name), processors)

    expect(processors.processExportRequest).toHaveBeenCalledWith(
      'request-1',
      'user-1',
      'attempt-1',
      true,
    )
    expect(processors.processCleanupExpiredExports).toHaveBeenCalledOnce()
    expect(processors.recoverExportRequests).toHaveBeenCalledOnce()
  })

  it('rejects unknown jobs', async () => {
    await expect(
      processAccountDataRequestJob(job('unknown'), {
        processCleanupExpiredExports: vi.fn<typeof processCleanupExpiredExports>(),
        processExportRequest: vi.fn<typeof processExportRequest>(),
        recoverExportRequests: vi.fn<typeof recoverExportRequests>(),
      }),
    ).rejects.toThrow('Unknown job name: unknown')
  })

  it('leaves legacy unfenced export jobs for database recovery', async () => {
    const mockProcessExportRequest = vi.fn<typeof processExportRequest>()
    await processAccountDataRequestJob(
      job(ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB.name, { requestId: 'request-1', userId: 'user-1' }),
      {
        processCleanupExpiredExports: vi.fn<typeof processCleanupExpiredExports>(),
        processExportRequest: mockProcessExportRequest,
        recoverExportRequests: vi.fn<typeof recoverExportRequests>(),
      },
    )
    expect(mockProcessExportRequest).not.toHaveBeenCalled()
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
