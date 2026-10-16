import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB } from '@queues/background/enqueues/account-lifecycle-jobs'
import {
  enqueueBulkExportRequests,
  enqueueCleanupExpiredExports,
  enqueueExportRequest,
  enqueueOrReactivateBulkExportRequests,
  enqueueRecoverExportRequests,
} from './account-data-requests.mts'
import { accountLifecycle } from '../queues.mts'
import { readAllQueueJobs } from '@voucha/test-helpers'

describe('account data request enqueues', () => {
  it('uses request and attempt database ids as the job and dedup ids', async () => {
    const requestId = randomUUID()
    const userId = randomUUID()
    const processingAttemptId = randomUUID()
    const jobId = `account-data-export__${requestId}__${processingAttemptId}`
    await enqueueExportRequest(requestId, userId, processingAttemptId)
    const jobs = await readAllQueueJobs(accountLifecycle)
    expect(jobs.find(job => job.id === jobId)).toMatchObject({
      id: jobId,
      data: { requestId, userId, processingAttemptId },
      opts: { deduplication: { id: jobId, mode: 'simple' } },
    })
  })

  it('uses the same logical ids for recovered bulk jobs', async () => {
    const data = {
      requestId: randomUUID(),
      userId: randomUUID(),
      processingAttemptId: randomUUID(),
    }
    const jobId = `account-data-export__${data.requestId}__${data.processingAttemptId}`
    const [job] = await enqueueBulkExportRequests([data])
    expect(job).toMatchObject({
      id: jobId,
      data,
      opts: { deduplication: { id: jobId, mode: 'simple' } },
    })
  })

  it('keeps a caller-supplied priority on the export job', async () => {
    const requestId = randomUUID()
    const processingAttemptId = randomUUID()
    const jobId = `account-data-export__${requestId}__${processingAttemptId}`
    await enqueueExportRequest(requestId, randomUUID(), processingAttemptId, 7)
    const jobs = await readAllQueueJobs(accountLifecycle)
    expect(jobs.find(job => job.id === jobId)).toMatchObject({ opts: { priority: 7 } })
  })

  it('marks a rejected export enqueue critical and attaches its call context', async () => {
    const requestId = randomUUID()
    const userId = randomUUID()
    const processingAttemptId = randomUUID()
    const failure = new Error('enqueue rejected')
    const add = vi.spyOn(accountLifecycle, 'add').mockRejectedValueOnce(failure)
    try {
      await expect(enqueueExportRequest(requestId, userId, processingAttemptId)).rejects.toBe(
        failure,
      )
    } finally {
      add.mockRestore()
    }
    expect(failure).toMatchObject({
      tags: { critical: true },
      extra: { requestId, userId, processingAttemptId, operation: 'enqueueExportRequest' },
    })
  })

  it('recovers bulk export requests under their logical job ids', async () => {
    const data = {
      requestId: randomUUID(),
      userId: randomUUID(),
      processingAttemptId: randomUUID(),
    }
    const jobId = `account-data-export__${data.requestId}__${data.processingAttemptId}`
    const jobs = await enqueueOrReactivateBulkExportRequests([data])
    expect(jobs.map(job => job.id)).toEqual([jobId])
  })

  it('throttles the periodic export recovery sweep under one deduplication id', async () => {
    await enqueueRecoverExportRequests()
    const jobs = await readAllQueueJobs(accountLifecycle)
    expect(jobs.find(job => job.name === ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB.name)).toMatchObject(
      {
        opts: {
          deduplication: { id: 'account-data-export-recovery', mode: 'throttle', ttl: 300_000 },
        },
      },
    )
  })

  it('runs operator-triggered export cleanup at background priority', async () => {
    await enqueueCleanupExpiredExports()
    const jobs = await readAllQueueJobs(accountLifecycle)
    expect(
      jobs.find(job => job.name === 'account-lifecycle.processCleanupExpiredExports'),
    ).toMatchObject({
      opts: {
        priority: 100,
        lockDuration: 600_000,
        ordering: { key: 'account-lifecycle', concurrency: 2 },
      },
    })
  })
})
