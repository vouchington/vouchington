import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  enqueueBulkApplyCopyrightActions,
  enqueueBulkApplyMediaDeliveryRegistryRecords,
  enqueueBulkDeliverCopyrightNotices,
  enqueueCheckCopyrightReviewTarget,
  enqueueReconcileCopyrightActionIntents,
  enqueueReconcileDsaStatementSubmissions,
  enqueueSweepCopyrightEvidenceRetention,
} from './enqueues.mts'
import { notifications } from './queues.mts'
import { readAllQueueJobs } from '@voucha/test-helpers'

describe('copyright and media-delivery notification enqueue wiring', () => {
  it('throttles action-intent reconciliation to one five-minute schedule', async () => {
    await enqueueReconcileCopyrightActionIntents()
    const job = (await readAllQueueJobs(notifications)).find(
      candidate => candidate.name === 'processReconcileCopyrightActionIntents',
    )
    expect(job?.data).toEqual({})
    expect(job?.opts).toMatchObject({
      deduplication: {
        id: 'copyright-action-reconciliation:{}',
        mode: 'throttle',
      },
    })
  })

  it('throttles the copyright review-target sweep to one five-minute schedule', async () => {
    await enqueueCheckCopyrightReviewTarget()
    const job = (await readAllQueueJobs(notifications)).find(
      candidate => candidate.name === 'processCheckCopyrightReviewTarget',
    )
    expect(job?.data).toEqual({})
    expect(job?.opts).toMatchObject({
      deduplication: {
        id: 'copyright-review-target-page',
        mode: 'throttle',
      },
    })
  })

  it('throttles the copyright evidence retention sweep to one schedule', async () => {
    await enqueueSweepCopyrightEvidenceRetention()
    const job = (await readAllQueueJobs(notifications)).find(
      candidate => candidate.name === 'processSweepCopyrightEvidenceRetention',
    )
    expect(job?.data).toEqual({})
    expect(job?.opts).toMatchObject({
      deduplication: {
        id: 'copyright-evidence-retention',
        mode: 'throttle',
      },
    })
  })

  it('throttles DSA statement reconciliation while preserving an empty scheduler payload', async () => {
    await enqueueReconcileDsaStatementSubmissions()
    const job = (await readAllQueueJobs(notifications)).find(
      candidate => candidate.name === 'processReconcileDsaStatementSubmissions',
    )
    expect(job?.data).toEqual({})
    expect(job?.opts).toMatchObject({
      deduplication: {
        id: 'copyright-dsa-statement-reconciliation',
        mode: 'throttle',
      },
    })
  })

  it('bulk-enqueues copyright action intents with the single-enqueue options per intent', async () => {
    const intentIds = [randomUUID(), randomUUID(), randomUUID()]
    await enqueueBulkApplyCopyrightActions(intentIds)

    for (const intentId of intentIds) {
      const jobs = await notifications.searchJobs({
        name: 'processApplyCopyrightAction',
        data: { intentId },
      })
      expect(jobs).toHaveLength(1)
      expect(jobs[0]?.opts).toMatchObject({
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: 10,
        deduplication: { id: `copyright-action:${intentId}`, mode: 'throttle', ttl: 300_000 },
      })
    }
  })

  it('bulk-enqueues in-app copyright delivery with the single-enqueue options per intent', async () => {
    const intentIds = [randomUUID(), randomUUID()]
    await enqueueBulkDeliverCopyrightNotices(intentIds)

    for (const intentId of intentIds) {
      const jobs = await notifications.searchJobs({
        name: 'processDeliverCopyrightNotice',
        data: { intentId },
      })
      expect(jobs).toHaveLength(1)
      expect(jobs[0]?.opts).toMatchObject({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: 10,
        deduplication: {
          id: `copyright-delivery:${intentId}:in-app`,
          mode: 'throttle',
          ttl: 300_000,
        },
      })
    }
  })

  it('bulk-enqueues registry projections with one dedup id per delivery key', async () => {
    const deliveryKeys = [
      `image-placement:${randomUUID()}:0:${randomUUID()}`,
      `image-placement:${randomUUID()}:1:${randomUUID()}`,
    ]
    await enqueueBulkApplyMediaDeliveryRegistryRecords(deliveryKeys)
    // A replayed page is collapsed by the per-key throttle id rather than queued twice.
    await enqueueBulkApplyMediaDeliveryRegistryRecords(deliveryKeys)

    for (const deliveryKey of deliveryKeys) {
      const jobs = await notifications.searchJobs({
        name: 'processApplyMediaDeliveryRegistryRecord',
        data: { deliveryKey },
      })
      expect(jobs).toHaveLength(1)
      expect(jobs[0]?.opts).toMatchObject({
        attempts: 5,
        priority: 10,
        deduplication: {
          id: `media-delivery-registry:${deliveryKey}`,
          mode: 'throttle',
          ttl: 300_000,
        },
      })
    }
  })
})
