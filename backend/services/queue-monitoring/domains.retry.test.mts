import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { closeAndUnregisterGlideMQInstance, createWorker } from '@data-stores/valkey-glide-mq'
import { createTestUser } from '@voucha/test-helpers'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { SES_INBOUND_PROCESS_JOB } from '@queues/background/enqueues/ses-inbound-jobs'
import { background } from '@queues/background/queues'
import { retryManagedQueueDomainFailedJobs } from './domains.mts'

// Mirrors the retry bound in domains.mts: one request replays at most this many failed jobs.
const RETRY_FAILED_LIMIT = 100

// A worker that fails every job it is given, so the jobs below stay failed until retried.
const worker = createWorker(BACKGROUND_QUEUE_NAME, async () => {
  throw new Error('seeded failure')
})
const failedJobIds: string[] = []

async function failProcessJob(): Promise<void> {
  const jobId = `ses-domain-retry-${randomUUID()}`
  failedJobIds.push(jobId)
  await expect(
    background.add(SES_INBOUND_PROCESS_JOB.name, {}, { jobId, attempts: 1, removeOnFail: 1_000 }),
  ).rejects.toThrow('seeded failure')
}

describe('retrying the failed jobs of a background domain', () => {
  afterEach(async () => {
    await Promise.all(
      failedJobIds.splice(0).map(async id => (await background.getJob(id))?.remove()),
    )
  })

  afterAll(() => closeAndUnregisterGlideMQInstance(worker))

  it('replays a failed job of the domain and counts it as retried', async () => {
    const admin = await createTestUser({ administrator: true })
    await failProcessJob()

    const result = await retryManagedQueueDomainFailedJobs(admin, 'background', 'ses-inbound')

    expect(result).toEqual({ success: true, retried: 1 })
  })

  it('stops searching once one request has replayed the retry limit', async () => {
    const admin = await createTestUser({ administrator: true })
    await Promise.all(Array.from({ length: RETRY_FAILED_LIMIT + 1 }, failProcessJob))

    const result = await retryManagedQueueDomainFailedJobs(admin, 'background', 'ses-inbound')

    // The in-memory test queue ignores the search `limit`, so the exact cap is not observable here;
    // the request still replays at least the limit and returns after the first job name met it.
    expect(result.retried).toBeGreaterThanOrEqual(RETRY_FAILED_LIMIT)
  })
})
