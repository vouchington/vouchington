import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import type {
  claimRecoverableDataRequests,
  RecoverableDataRequest,
} from '@services/account-data-requests/recovery'
import type { enqueueBulkExportRequests } from '@queues/account-data-requests/enqueues'
import {
  type processCleanupExpiredExports,
  type processExportRequest,
  recoverExportRequests,
} from '../processors.mts'
import { processAccountDataRequestJob } from './process-job.mts'

describe('processAccountDataRequestJob', () => {
  it('routes export, cleanup, and recovery jobs', async () => {
    const processors = {
      processCleanupExpiredExports: vi.fn<typeof processCleanupExpiredExports>(),
      processExportRequest: vi.fn<typeof processExportRequest>(),
      recoverExportRequests: vi.fn<typeof recoverExportRequests>(),
    }

    await processAccountDataRequestJob(
      job('processExportRequest', {
        requestId: 'request-1',
        userId: 'user-1',
        processingAttemptId: 'attempt-1',
      }),
      processors,
    )
    await processAccountDataRequestJob(job('processCleanupExpiredExports'), processors)
    await processAccountDataRequestJob(job('recoverExportRequests'), processors)

    expect(processors.processExportRequest).toHaveBeenCalledWith(
      'request-1',
      'user-1',
      undefined,
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
      job('processExportRequest', { requestId: 'request-1', userId: 'user-1' }),
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
    const requests: RecoverableDataRequest[] = [
      { requestId: 'request-1', userId: 'user-1', processingAttemptId: 'attempt-1' },
    ]
    const claim = vi.fn<typeof claimRecoverableDataRequests>().mockResolvedValue(requests)
    const enqueue = vi.fn<typeof enqueueBulkExportRequests>().mockResolvedValue([])

    await expect(
      recoverExportRequests({
        claimRecoverableDataRequests: claim,
        enqueueBulkExportRequests: enqueue,
      }),
    ).resolves.toEqual({ enqueued: 1 })
    expect(enqueue).toHaveBeenCalledWith(requests)
  })

  it('does not enqueue an empty recovery batch', async () => {
    const claim = vi.fn<typeof claimRecoverableDataRequests>().mockResolvedValue([])
    const enqueue = vi.fn<typeof enqueueBulkExportRequests>()

    await expect(
      recoverExportRequests({
        claimRecoverableDataRequests: claim,
        enqueueBulkExportRequests: enqueue,
      }),
    ).resolves.toEqual({ enqueued: 0 })
    expect(enqueue).not.toHaveBeenCalled()
  })
})

function job(name: string, data: Record<string, unknown> = {}): Job {
  return { name, data, attemptsMade: 2, opts: { attempts: 3 } } as Job
}
