import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { Job } from 'glide-mq'
import { dataRequestPubSub } from '@data-stores/valkey-pubsub'
import { createDataRequest, getDataRequestById } from '@services/account-data-requests'
import { ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB } from '@queues/background/enqueues/account-lifecycle-jobs'
import { createTestUser } from '@voucha/test-helpers'
import { processAccountDataRequestJob } from './account-data-request-job.mts'

// Only the external S3 provider call is replaced; the database, queues, files and zip are real.
const mockS3Send = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>())
vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => ({
  ...(await importOriginal<typeof import('@modules/aws')>()),
  S3ImagesClient: { send: mockS3Send } as unknown as typeof import('@modules/aws').S3ImagesClient,
}))

describe('processAccountDataRequestJob export', () => {
  let publish: MockInstance<typeof dataRequestPubSub.publish>

  beforeEach(() => {
    mockS3Send.mockReset()
    mockS3Send.mockResolvedValue({})
    publish = vi.spyOn(dataRequestPubSub, 'publish')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runs a fenced export job through the processor and publishes ready', async () => {
    const { subject, request } = await startRequest()

    await processAccountDataRequestJob(exportJob(request, subject.id, 0))

    expect(await getDataRequestById(subject.id, subject.id, request.id)).toMatchObject({
      status: 'ready',
      s3_key: `${request.id}/${request.processing_attempt_id}.zip`,
    })
    expect(publish).toHaveBeenCalledWith(request.id, { status: 'ready' })
  })

  it.each([
    ['fails the request on the final job attempt', 2, 'failed'],
    ['leaves the request retryable on an earlier job attempt', 0, 'pending'],
  ])('%s', async (_name, attemptsMade, status) => {
    const { subject, request } = await startRequest()
    mockS3Send.mockRejectedValue(new Error('S3 upload failed'))

    await expect(
      processAccountDataRequestJob(exportJob(request, subject.id, attemptsMade)),
    ).rejects.toThrow(`Export failed for request ${request.id}`)

    expect(await getDataRequestById(subject.id, subject.id, request.id)).toMatchObject({
      status,
      last_error_message: 'S3 upload failed',
    })
  })
})

async function startRequest() {
  const subject = await createTestUser()
  const request = await createDataRequest(subject.id, subject.id)
  return { subject, request }
}

function exportJob(
  request: { id: string; processing_attempt_id: string },
  userId: string,
  attemptsMade: number,
): Job {
  return {
    name: ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB.name,
    data: { requestId: request.id, userId, processingAttemptId: request.processing_attempt_id },
    attemptsMade,
    opts: { attempts: 3 },
  } as Job
}
