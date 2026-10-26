import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  enqueueBulkReconcilePostNotifications,
  enqueueContinueReconcilePostNotifications,
  enqueueContinueReconcileRssFeedItemNotifications,
  enqueueContinueContentVisibility,
  enqueueBulkApplyCopyrightActions,
  enqueueBulkApplyMediaDeliveryRegistryRecords,
  enqueueBulkDeliverCopyrightNotices,
  enqueueCheckCopyrightReviewTarget,
  enqueueReconcileCopyrightActionIntents,
  enqueueReconcileDsaStatementSubmissions,
  enqueueSweepCopyrightEvidenceRetention,
} from './enqueues.mts'
import { notifications } from './queues.mts'
import { PRIORITY_DISPATCH } from '@queues/background/config'
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
    const changeId = randomUUID()
    await enqueueBulkReconcilePostNotifications([postId], changeId)
    await enqueueContinueReconcilePostNotifications({ postId, changeId, afterUserId })
    // The same cursor is one job; the root job's debounce never swallows a continuation.
    await enqueueContinueReconcilePostNotifications({ postId, changeId, afterUserId })

    const jobs = await notifications.searchJobs({
      name: 'notifications.processReconcilePostNotifications',
      data: { postId },
    })
    const continuation = jobs.filter(
      job => (job.data as { afterUserId?: string }).afterUserId === afterUserId,
    )
    expect(jobs).toHaveLength(2)
    expect(continuation).toHaveLength(1)
    expect(continuation[0]?.id).toBe(
      `notifications__reconcile-post__${postId}__${changeId}__${afterUserId}`,
    )
    expect(continuation[0]?.opts).toMatchObject({
      priority: PRIORITY_DISPATCH,
      removeOnComplete: true,
      removeOnFail: true,
    })
    expect(
      jobs.find(job => (job.data as { afterUserId?: string }).afterUserId === undefined)?.opts,
    ).toMatchObject({
      priority: PRIORITY_DISPATCH,
    })
  })

  it('queues an RSS feed item continuation under its own namespaced job id', async () => {
    const rssFeedItemId = randomUUID()
    const afterUserId = randomUUID()
    const changeId = randomUUID()
    await enqueueContinueReconcileRssFeedItemNotifications({ rssFeedItemId, changeId, afterUserId })

    const job = await notifications.getJob(
      `notifications__reconcile-rss-feed-item__${rssFeedItemId}__${changeId}__${afterUserId}`,
    )
    expect(job?.name).toBe('notifications.processReconcileRssFeedItemNotifications')
    expect(job?.data).toEqual({ rssFeedItemId, changeId, afterUserId })
    expect(job?.opts).toMatchObject({ priority: PRIORITY_DISPATCH })
  })

  it('keeps two accepted edits to one post as distinct bulk jobs and pages', async () => {
    const postId = randomUUID()
    const firstChangeId = randomUUID()
    const secondChangeId = randomUUID()
    const afterUserId = randomUUID()
    await enqueueBulkReconcilePostNotifications([postId], firstChangeId)
    await enqueueBulkReconcilePostNotifications([postId], secondChangeId)
    await enqueueContinueReconcilePostNotifications({
      postId,
      changeId: firstChangeId,
      afterUserId,
    })
    await enqueueContinueReconcilePostNotifications({
      postId,
      changeId: secondChangeId,
      afterUserId,
    })

    for (const changeId of [firstChangeId, secondChangeId]) {
      const root = await notifications.getJob(
        `notifications__reconcile-post__${postId}__${changeId}__root`,
      )
      const page = await notifications.getJob(
        `notifications__reconcile-post__${postId}__${changeId}__${afterUserId}`,
      )
      expect(root?.data).toEqual({ postId, changeId })
      expect(page?.data).toEqual({ postId, changeId, afterUserId })
      expect(root?.opts.ordering).toMatchObject({
        key: `notifications:bulk:post:${postId}`,
        concurrency: 1,
      })
      expect(page?.opts.ordering).toMatchObject({
        key: `notifications:bulk:post:${postId}`,
        concurrency: 1,
      })
    }
  })

  it('uses the same per-item bulk lane for visibility continuations', async () => {
    const postId = randomUUID()
    const changeId = randomUUID()
    const after = { userId: randomUUID(), notificationId: randomUUID() }
    await enqueueContinueContentVisibility({ postId, changeId, after })
    const job = await notifications.getJob(
      `notifications__content-visibility__post__${postId}__${changeId}__${after.userId}__${after.notificationId}`,
    )
    expect(job?.data).toEqual({ postId, changeId, after })
    expect(job?.opts.ordering).toMatchObject({
      key: `notifications:bulk:post:${postId}`,
      concurrency: 1,
    })
  })
})
