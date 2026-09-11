import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { CLEANUP_PRIORITY, PROCESS_PRIORITY } from './config.mts'
import {
  enqueueActivityPubInboxDelivery,
  enqueueBulkActivityPubInboxDeliveries,
  enqueueDelayedActivityPubInboxDelivery,
  enqueueCleanupExpiredActivityPubInboxDeliveries,
  enqueueRecoverActivityPubInboxDeliveries,
} from './enqueues.mts'
import { activitypubInbox } from './queues.mts'

describe('ActivityPub inbox enqueues', () => {
  it('uses the durable delivery and attempt ids for both job and simple dedup ids', async () => {
    const data = { deliveryId: randomUUID(), processingAttemptId: randomUUID() }
    const jobId = `activitypub-inbox__${data.deliveryId}__${data.processingAttemptId}`
    await enqueueActivityPubInboxDelivery(data)
    const jobs = await readAllQueueJobs(activitypubInbox)
    expect(jobs.find(job => job.id === jobId)).toMatchObject({
      id: jobId,
      name: 'processDelivery',
      data,
      opts: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
        priority: 10,
        removeOnComplete: 100,
        removeOnFail: 100,
        deduplication: { id: jobId, mode: 'simple' },
      },
    })
  })

  it('preserves the same logical ids and uses recovery priority for recovered bulk jobs', async () => {
    const data = { deliveryId: randomUUID(), processingAttemptId: randomUUID() }
    const jobId = `activitypub-inbox__${data.deliveryId}__${data.processingAttemptId}`
    const [job] = await enqueueBulkActivityPubInboxDeliveries([data])
    expect(job).toMatchObject({
      id: jobId,
      data,
      opts: { priority: 100, deduplication: { id: jobId, mode: 'simple' } },
    })
  })

  it('keeps delayed deliveries at ordinary processing priority', async () => {
    const data = { deliveryId: randomUUID(), processingAttemptId: randomUUID() }
    const jobId = `activitypub-inbox__${data.deliveryId}__${data.processingAttemptId}`

    const job = await enqueueDelayedActivityPubInboxDelivery(data, 1_000)

    expect(job).toMatchObject({
      id: jobId,
      data,
      opts: {
        delay: 1_000,
        priority: 10,
        deduplication: { id: jobId, mode: 'simple' },
      },
    })
  })

  it('enqueues the recovery dispatcher at low priority with throttled deduplication', async () => {
    await enqueueRecoverActivityPubInboxDeliveries()
    const jobs = await readAllQueueJobs(activitypubInbox)
    expect(jobs.find(job => job.name === 'recoverDeliveries')).toMatchObject({
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

  it('enqueues cleanup ahead of ordinary deliveries with interval-scoped deduplication', async () => {
    await enqueueCleanupExpiredActivityPubInboxDeliveries()
    const jobs = await readAllQueueJobs(activitypubInbox)
    expect(jobs.find(job => job.name === 'cleanupExpiredDeliveries')).toMatchObject({
      id: expect.stringMatching(/^activitypub-inbox-cleanup__\d+$/),
      opts: {
        priority: CLEANUP_PRIORITY,
        deduplication: {
          id: 'activitypub-inbox-cleanup',
          mode: 'throttle',
          ttl: 300_000,
        },
      },
    })
    expect(CLEANUP_PRIORITY).toBeLessThan(PROCESS_PRIORITY)
  })
})
