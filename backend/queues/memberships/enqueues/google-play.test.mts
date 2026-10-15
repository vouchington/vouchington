import { createHash, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { MEMBERSHIPS_GOOGLE_PLAY_NOTIFICATION_JOB } from '@queues/background/enqueues/memberships-jobs'
import {
  forgetDedupEntries,
  removeQueuedJobsById,
} from '../../../test-helpers/shared-queue-cleanup.mts'
import { memberships } from '../queues.mts'
import {
  enqueueAcknowledgeGooglePlayPurchase,
  enqueueProcessGooglePlayNotification,
  enqueueRecoverGooglePlayAcknowledgements,
  enqueueRecoverGooglePlayActiveSources,
  enqueueRecoverGooglePlayNotifications,
  enqueueRefreshGooglePlayOidcTrust,
} from './google-play.mts'
import {
  enqueueBulkAcknowledgeGooglePlayPurchases,
  enqueueBulkProcessGooglePlayNotifications,
  enqueueBulkReconcileGooglePlayActiveSources,
} from './google-play-jobs.mts'

const RECOVERY_DEDUP_IDS = [
  'google-play-notification-recovery',
  'google-play-acknowledgement-recovery',
  'google-play-active-source-recovery',
  'google-play-oidc-refresh',
]

describe('Google Play membership enqueues', () => {
  const created: string[] = []
  afterEach(async () => {
    await removeQueuedJobsById(memberships, created.splice(0))
    forgetDedupEntries(BACKGROUND_QUEUE_NAME, RECOVERY_DEDUP_IDS)
  })

  it('keeps purchase tokens out of jobs and serializes notification work by token digest', async () => {
    const evidenceId = randomUUID()
    const purchaseToken = `synthetic-${randomUUID()}`
    const purchaseTokenLookupSha256 = createHash('sha256').update(purchaseToken).digest('hex')
    await enqueueProcessGooglePlayNotification({ evidenceId, purchaseToken, environment: 'test' })
    const jobId = `google-play-notification__${evidenceId}`
    created.push(jobId)
    const job = await memberships.getJob(jobId)
    expect(job).toMatchObject({
      name: MEMBERSHIPS_GOOGLE_PLAY_NOTIFICATION_JOB.name,
      data: { evidenceId, purchaseTokenLookupSha256, environment: 'test' },
      opts: {
        priority: 10,
        deduplication: { id: jobId, mode: 'simple' },
        ordering: {
          key: `memberships:google-play-token:test:${purchaseTokenLookupSha256}`,
          concurrency: 1,
        },
      },
    })
    // Serialize the payload only: a live test job references its queue, which references the job.
    expect(JSON.stringify({ data: job!.data, opts: job!.opts })).not.toContain(purchaseToken)
  })

  it('deduplicates acknowledgement and source reconciliation by stable identity', async () => {
    const acknowledgementId = randomUUID()
    const sourceId = randomUUID()
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_123)
    try {
      await enqueueAcknowledgeGooglePlayPurchase({ acknowledgementId })
      await enqueueBulkReconcileGooglePlayActiveSources([{ sourceId }])
    } finally {
      dateNow.mockRestore()
    }
    const bucket = Math.floor(1_800_000_000_123 / 3_600_000)
    created.push(
      `google-play-acknowledgement__${acknowledgementId}`,
      `google-play-active-source__${sourceId}__${bucket}`,
    )
    expect(
      await memberships.getJob(`google-play-acknowledgement__${acknowledgementId}`),
    ).toMatchObject({
      data: { acknowledgementId },
      opts: {
        deduplication: { id: `google-play-acknowledgement__${acknowledgementId}`, mode: 'simple' },
      },
    })
    expect(
      await memberships.getJob(`google-play-active-source__${sourceId}__${bucket}`),
    ).toMatchObject({
      data: { sourceId },
      opts: {
        ordering: { key: `memberships:google-play-source:${sourceId}`, concurrency: 1 },
      },
    })
  })

  it('bulk-enqueues recovery rows with the single-enqueue identity and options per row', async () => {
    const now = 1_800_000_000_123
    const bucket = Math.floor(now / 3_600_000)
    const notifications = [randomUUID(), randomUUID()].map((evidenceId, index) => ({
      evidenceId,
      purchaseToken: `synthetic-${randomUUID()}`,
      environment: index === 0 ? ('test' as const) : ('production' as const),
    }))
    const acknowledgementIds = [randomUUID(), randomUUID()]
    const sourceIds = [randomUUID(), randomUUID()]
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now)
    try {
      await enqueueBulkProcessGooglePlayNotifications(notifications)
      await enqueueBulkAcknowledgeGooglePlayPurchases(
        acknowledgementIds.map(acknowledgementId => ({ acknowledgementId })),
      )
      await enqueueBulkReconcileGooglePlayActiveSources(sourceIds.map(sourceId => ({ sourceId })))
    } finally {
      dateNow.mockRestore()
    }
    const payloads: unknown[] = []

    for (const notification of notifications) {
      const jobId = `google-play-notification__${notification.evidenceId}`
      created.push(jobId)
      const purchaseTokenLookupSha256 = createHash('sha256')
        .update(notification.purchaseToken)
        .digest('hex')
      const job = await memberships.getJob(jobId)
      payloads.push({ data: job?.data, opts: job?.opts })
      expect(job).toMatchObject({
        data: {
          evidenceId: notification.evidenceId,
          purchaseTokenLookupSha256,
          environment: notification.environment,
        },
        opts: {
          priority: 10,
          deduplication: { id: jobId, mode: 'simple' },
          ordering: {
            key: `memberships:google-play-token:${notification.environment}:${purchaseTokenLookupSha256}`,
            concurrency: 1,
          },
        },
      })
    }
    for (const acknowledgementId of acknowledgementIds) {
      const jobId = `google-play-acknowledgement__${acknowledgementId}`
      created.push(jobId)
      expect(await memberships.getJob(jobId)).toMatchObject({
        data: { acknowledgementId },
        opts: { priority: 10, deduplication: { id: jobId, mode: 'simple' } },
      })
    }
    for (const sourceId of sourceIds) {
      const jobId = `google-play-active-source__${sourceId}__${bucket}`
      created.push(jobId)
      expect(await memberships.getJob(jobId)).toMatchObject({
        data: { sourceId },
        opts: {
          priority: 10,
          deduplication: { id: jobId, mode: 'simple' },
          ordering: { key: `memberships:google-play-source:${sourceId}`, concurrency: 1 },
        },
      })
    }
    for (const notification of notifications)
      expect(JSON.stringify(payloads)).not.toContain(notification.purchaseToken)
  })

  it('throttles each recovery and trust-refresh scan to its own interval', async () => {
    const now = 1_800_000_000_123
    forgetDedupEntries(BACKGROUND_QUEUE_NAME, RECOVERY_DEDUP_IDS)
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now)
    try {
      await enqueueRecoverGooglePlayNotifications()
      await enqueueRecoverGooglePlayAcknowledgements()
      await enqueueRecoverGooglePlayActiveSources()
      await enqueueRefreshGooglePlayOidcTrust()
      for (const [prefix, intervalMs] of [
        ['google-play-notification-recovery', 300_000],
        ['google-play-acknowledgement-recovery', 300_000],
        ['google-play-active-source-recovery', 3_600_000],
        ['google-play-oidc-refresh', 10_800_000],
      ] as const) {
        const id = `${prefix}__${Math.floor(now / intervalMs)}`
        created.push(id)
        expect(await memberships.getJob(id)).toMatchObject({
          data: {},
          opts: {
            priority: 100,
            deduplication: { id: prefix, mode: 'throttle', ttl: intervalMs },
          },
        })
      }
    } finally {
      dateNow.mockRestore()
    }
  })
})
