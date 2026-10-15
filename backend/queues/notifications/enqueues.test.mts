import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  enqueueBulkReconcilePostNotifications,
  enqueueContinueReconcilePostNotifications,
  enqueueContinueReconcileRssFeedItemNotifications,
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
      candidate => candidate.name === 'notifications.processReconcileCopyrightActionIntents',
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
      candidate => candidate.name === 'notifications.processCheckCopyrightReviewTarget',
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
      candidate => candidate.name === 'notifications.processSweepCopyrightEvidenceRetention',
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
      candidate => candidate.name === 'notifications.processReconcileDsaStatementSubmissions',
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
        name: 'notifications.processApplyCopyrightAction',
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
        name: 'notifications.processDeliverCopyrightNotice',
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

  it('bulk-enqueues registry projections with one dedup id per registry record', async () => {
    const recordIds = [randomUUID(), randomUUID()]
    await enqueueBulkApplyMediaDeliveryRegistryRecords(recordIds)
    // A replayed page is collapsed by the per-record throttle id rather than queued twice.
    await enqueueBulkApplyMediaDeliveryRegistryRecords(recordIds)

    for (const mediaDeliveryRegistryRecordId of recordIds) {
      const jobs = await notifications.searchJobs({
        name: 'notifications.processApplyMediaDeliveryRegistryRecord',
        data: { mediaDeliveryRegistryRecordId },
      })
      expect(jobs).toHaveLength(1)
      expect(jobs[0]?.opts).toMatchObject({
        attempts: 5,
        priority: 10,
        deduplication: {
          id: `media-delivery-registry:${mediaDeliveryRegistryRecordId}`,
          mode: 'throttle',
          ttl: 300_000,
        },
      })
    }
  })

  it('queues a reconcile continuation as its own dispatcher-priority job per cursor', async () => {
    const postId = randomUUID()
    const afterUserId = randomUUID()
    await enqueueBulkReconcilePostNotifications([postId])
    await enqueueContinueReconcilePostNotifications({ postId, afterUserId })
    // The same cursor is one job; the root job's debounce never swallows a continuation.
    await enqueueContinueReconcilePostNotifications({ postId, afterUserId })

    const jobs = await notifications.searchJobs({
      name: 'notifications.processReconcilePostNotifications',
      data: { postId },
    })
    const continuation = jobs.filter(
      job => (job.data as { afterUserId?: string }).afterUserId === afterUserId,
    )
    expect(jobs).toHaveLength(2)
    expect(continuation).toHaveLength(1)
    expect(continuation[0]?.id).toBe(`notifications__reconcile-post__${postId}__${afterUserId}`)
    expect(continuation[0]?.opts).toMatchObject({
      priority: 100,
      removeOnComplete: true,
      removeOnFail: true,
    })
    expect(
      jobs.find(job => (job.data as { afterUserId?: string }).afterUserId === undefined)?.opts,
    ).toMatchObject({
      priority: 10,
    })
  })

  it('queues an RSS feed item continuation under its own namespaced job id', async () => {
    const rssFeedItemId = randomUUID()
    const afterUserId = randomUUID()
    await enqueueContinueReconcileRssFeedItemNotifications({ rssFeedItemId, afterUserId })

    const job = await notifications.getJob(
      `notifications__reconcile-rss-feed-item__${rssFeedItemId}__${afterUserId}`,
    )
    expect(job?.name).toBe('notifications.processReconcileRssFeedItemNotifications')
    expect(job?.data).toEqual({ rssFeedItemId, afterUserId })
    expect(job?.opts).toMatchObject({ priority: 100 })
  })
})
