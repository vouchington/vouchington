import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { enqueueBulkExportRequests, enqueueExportRequest } from './enqueues.mts'
import { accountDataRequests } from './queues.mts'

describe('account data request enqueues', () => {
  it('uses request and attempt database ids as the job and dedup ids', async () => {
    const requestId = randomUUID()
    const userId = randomUUID()
    const processingAttemptId = randomUUID()
    const jobId = `account-data-export__${requestId}__${processingAttemptId}`
    await enqueueExportRequest(requestId, userId, processingAttemptId)
    const jobs = (
      await Promise.all(
        (['waiting', 'active', 'completed', 'failed'] as const).map(state =>
          accountDataRequests.getJobs(state),
        ),
      )
    ).flat()
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
})
