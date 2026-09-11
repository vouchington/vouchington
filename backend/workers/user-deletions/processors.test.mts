import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import type {
  claimRecoverableUserDeletions,
  processUserDeletionBatch,
} from '@services/user-deletions'
import type { enqueueBulkUserDeletions, enqueueUserDeletion } from '@queues/user-deletions/enqueues'
import { isFinalUserDeletionAttempt, processUserDeletionJob } from './processors/process-job.mts'
import { processUserDeletion, recoverUserDeletions } from './processors.mts'

describe('user-deletions processor', () => {
  it('routes a fenced process job with its request and processing attempt', async () => {
    const processDeletion = vi.fn<typeof processUserDeletion>()
    const recoverDeletions = vi.fn<typeof recoverUserDeletions>()

    await processUserDeletionJob(
      job('processUserDeletion', {
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
        'processUserDeletion',
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

  it('treats a missing attempt limit as a final attempt', () => {
    const jobWithoutAttemptLimit = { attemptsMade: 0, opts: {} } as Pick<
      Job,
      'attemptsMade' | 'opts'
    >

    expect(isFinalUserDeletionAttempt(jobWithoutAttemptLimit)).toBe(true)
  })

  it.each([
    ['request ID', { processingAttemptId: 'attempt-1' }],
    ['processing attempt ID', { requestId: 'request-1' }],
  ])('leaves a process job missing its %s for recovery', async (_missingFence, data) => {
    const processDeletion = vi.fn<typeof processUserDeletion>()
    const recoverDeletions = vi.fn<typeof recoverUserDeletions>()

    await processUserDeletionJob(job('processUserDeletion', data), {
      processUserDeletion: processDeletion,
      recoverUserDeletions: recoverDeletions,
    })

    expect(processDeletion).not.toHaveBeenCalled()
    expect(recoverDeletions).not.toHaveBeenCalled()
  })

  it('routes recovery jobs', async () => {
    const processDeletion = vi.fn<typeof processUserDeletion>()
    const recoverDeletions = vi.fn<typeof recoverUserDeletions>()

    await processUserDeletionJob(job('recoverUserDeletions'), {
      processUserDeletion: processDeletion,
      recoverUserDeletions: recoverDeletions,
    })

    expect(recoverDeletions).toHaveBeenCalledOnce()
    expect(processDeletion).not.toHaveBeenCalled()
  })

  it('processes one fenced deletion batch', async () => {
    const next = { requestId: 'request-1', processingAttemptId: 'attempt-2' }
    const processBatch = vi.fn<typeof processUserDeletionBatch>().mockResolvedValue(next)
    const enqueue = vi.fn<typeof enqueueUserDeletion>().mockResolvedValue()

    await processUserDeletion(
      'request-1',
      'attempt-1',
      { isFinalAttempt: true },
      {
        processUserDeletionBatch: processBatch,
        enqueueUserDeletion: enqueue,
      },
    )

    expect(processBatch).toHaveBeenCalledWith(
      'request-1',
      'attempt-1',
      {
        processPhaseBatch: expect.any(Function),
      },
      {
        isFinalAttempt: true,
      },
    )
    expect(enqueue).toHaveBeenCalledWith(next)
  })

  it('recovers durable requests and enqueues their recoverable attempts', async () => {
    const claimed = [{ requestId: 'request-1', processingAttemptId: 'attempt-2' }]
    const claim = vi.fn<typeof claimRecoverableUserDeletions>().mockResolvedValue(claimed)
    const enqueue = vi.fn<typeof enqueueBulkUserDeletions>().mockResolvedValue([])

    await expect(
      recoverUserDeletions({
        claimRecoverableUserDeletions: claim,
        enqueueBulkUserDeletions: enqueue,
      }),
    ).resolves.toEqual({ enqueued: 1 })
    expect(enqueue).toHaveBeenCalledWith(claimed)
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
