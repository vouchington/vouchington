import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import {
  enqueueActivityPubInboxDelivery,
  enqueueBulkActivityPubInboxDeliveries,
  enqueueCleanupExpiredActivityPubInboxDeliveries,
  enqueueRearmFailedActivityPubInboxDeliveriesContinuation,
  enqueueRecoverActivityPubInboxDeliveries,
} from './inbox.mts'
import { activitypub } from '../queues.mts'

describe('ActivityPub inbox enqueues', () => {
  it('deduplicates the signed-request digest across repeated enqueues', async () => {
    const data = { deliveryId: randomUUID(), requestDigest: randomUUID() }
    const jobId = `activitypub-inbox__${data.requestDigest}`
    await enqueueActivityPubInboxDelivery(data)
    expect(await enqueueActivityPubInboxDelivery(data)).toBeNull()
    const jobs = await readAllQueueJobs(activitypub)
    expect(jobs.find(job => job.id === jobId)).toMatchObject({
      id: jobId,
      name: 'activitypub.processDelivery',
      data,
      opts: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
        priority: 10,
        removeOnComplete: 100,
        removeOnFail: false,
        deduplication: { id: jobId, mode: 'simple' },
      },
    })
  })

  it('preserves the same logical ids and uses recovery priority for recovered bulk jobs', async () => {
    const data = { deliveryId: randomUUID(), requestDigest: randomUUID() }
    const jobId = `activitypub-inbox__${data.requestDigest}`
    const [job] = await enqueueBulkActivityPubInboxDeliveries([data])
    expect(job).toMatchObject({
      id: jobId,
      data,
      opts: { priority: 100, deduplication: { id: jobId, mode: 'simple' } },
    })
  })

  it('enqueues the recovery dispatcher at low priority with throttled deduplication', async () => {
    await enqueueRecoverActivityPubInboxDeliveries()
    const jobs = await readAllQueueJobs(activitypub)
    expect(jobs.find(job => job.name === 'activitypub.recoverDeliveries')).toMatchObject({
      opts: {
        priority: 100,
        deduplication: {
          id: 'activitypub-inbox-recovery',
          mode: 'throttle',
          ttl: 300_000,
        },
      },
    })
  })

  it('enqueues cleanup in its own lane with interval-scoped deduplication', async () => {
    await enqueueCleanupExpiredActivityPubInboxDeliveries()
    const jobs = await readAllQueueJobs(activitypub)
    expect(jobs.find(job => job.name === 'activitypub.cleanupExpiredDeliveries')).toMatchObject({
      id: expect.stringMatching(/^activitypub-inbox-cleanup__\d+$/),
      opts: {
        priority: 100,
        ordering: { key: 'activitypub:cleanup', concurrency: 1 },
        deduplication: {
          id: 'activitypub-inbox-cleanup',
          mode: 'throttle',
          ttl: 300_000,
        },
      },
    })
  })

  it('enqueues a re-arm continuation whose job id is the cursor and which releases its record', async () => {
    const afterId = randomUUID()
    const jobId = `activitypub-inbox-failed-backfill__${afterId}`

    await enqueueRearmFailedActivityPubInboxDeliveriesContinuation(afterId)

    const jobs = await readAllQueueJobs(activitypub)
    expect(jobs.find(job => job.id === jobId)).toMatchObject({
      id: jobId,
      name: 'activitypub.rearmFailedDeliveries',
      data: { afterId },
      opts: { removeOnComplete: true, removeOnFail: true },
    })
  })
})
