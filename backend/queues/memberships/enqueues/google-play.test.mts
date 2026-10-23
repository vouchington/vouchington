import { createHash, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memberships } from '../queues.mts'
import {
  enqueueAcknowledgeGooglePlayPurchase,
  enqueueProcessGooglePlayNotification,
  enqueueRecoverGooglePlayAcknowledgements,
  enqueueRecoverGooglePlayActiveSources,
  enqueueContinueRecoverGooglePlayActiveSources,
  enqueueRecoverGooglePlayNotifications,
  enqueueRefreshGooglePlayOidcTrust,
} from './google-play.mts'
import {
  enqueueBulkAcknowledgeGooglePlayPurchases,
  enqueueBulkProcessGooglePlayNotifications,
  enqueueBulkReconcileGooglePlayActiveSources,
} from './google-play-jobs.mts'

const queueStates = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const
const queuedJobs = async () =>
  (await Promise.all(queueStates.map(state => memberships.getJobs(state)))).flat()

describe('Google Play membership enqueues', () => {
  afterEach(() => memberships.obliterate({ force: true }))

  it('gives every page continuation a fresh identity while retaining scheduled recovery dedup', async () => {
    await enqueueRecoverGooglePlayActiveSources()
    await enqueueContinueRecoverGooglePlayActiveSources()
    await enqueueContinueRecoverGooglePlayActiveSources()
    const jobs = (await queuedJobs()).filter(job => job.name === 'recoverGooglePlayActiveSources')
    expect(jobs).toHaveLength(3)
    expect(new Set(jobs.map(job => job.id)).size).toBe(3)
    expect(jobs.map(job => job.opts.ordering)).toEqual([
      { key: 'google-play-active-source-recovery', concurrency: 1 },
      { key: 'google-play-active-source-recovery', concurrency: 1 },
      { key: 'google-play-active-source-recovery', concurrency: 1 },
    ])
  })

  it('admits the same source in a later recovery hour', async () => {
    const sourceId = randomUUID()
    const now = 1_800_000_000_123
    const dateNow = vi.spyOn(Date, 'now')
    try {
      dateNow.mockReturnValue(now)
      await enqueueBulkReconcileGooglePlayActiveSources([{ sourceId }])
      dateNow.mockReturnValue(now + 3_600_000)
      await enqueueBulkReconcileGooglePlayActiveSources([{ sourceId }])
    } finally {
      dateNow.mockRestore()
    }
    const sourceJobs = (await queuedJobs()).filter(
      job =>
        job.name === 'reconcileGooglePlayActiveSource' &&
        typeof job.data === 'object' &&
        job.data !== null &&
        'sourceId' in job.data &&
        job.data.sourceId === sourceId,
    )
    expect(sourceJobs).toHaveLength(2)
    expect(new Set(sourceJobs.map(job => job.id)).size).toBe(2)
  })

  it('keeps purchase tokens out of jobs and serializes notification work by token digest', async () => {
    const evidenceId = randomUUID()
    const purchaseToken = `synthetic-${randomUUID()}`
    const purchaseTokenLookupSha256 = createHash('sha256').update(purchaseToken).digest('hex')
    await enqueueProcessGooglePlayNotification({ evidenceId, purchaseToken, environment: 'test' })
    const jobId = `google-play-notification__${evidenceId}`
    expect((await queuedJobs()).find(job => job.id === jobId)).toMatchObject({
      data: { evidenceId, purchaseTokenLookupSha256, environment: 'test' },
      opts: {
        deduplication: { id: jobId, mode: 'simple' },
        ordering: { key: `google-play-token:test:${purchaseTokenLookupSha256}`, concurrency: 1 },
      },
    })
    // Serialize the payloads only: a live test job references its queue, which references the job.
    const payloads = (await queuedJobs()).map(job => ({ data: job.data, opts: job.opts }))
    expect(JSON.stringify(payloads)).not.toContain(purchaseToken)
  })

  it('deduplicates acknowledgement and source reconciliation by stable identity', async () => {
    const acknowledgementId = randomUUID()
    const sourceId = randomUUID()
    await enqueueAcknowledgeGooglePlayPurchase({ acknowledgementId })
    await enqueueBulkReconcileGooglePlayActiveSources([{ sourceId }])
    const jobs = await queuedJobs()
    expect(
      jobs.find(job => job.id === `google-play-acknowledgement__${acknowledgementId}`),
    ).toMatchObject({
      data: { acknowledgementId },
      opts: {
        deduplication: { id: `google-play-acknowledgement__${acknowledgementId}`, mode: 'simple' },
      },
    })
    expect(
      jobs.find(job => job.id?.startsWith(`google-play-active-source__${sourceId}__`)),
    ).toMatchObject({
      data: { sourceId },
      opts: { ordering: { key: `google-play-source:${sourceId}`, concurrency: 1 } },
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
    const jobs = await queuedJobs()

    for (const notification of notifications) {
      const jobId = `google-play-notification__${notification.evidenceId}`
      const purchaseTokenLookupSha256 = createHash('sha256')
        .update(notification.purchaseToken)
        .digest('hex')
      expect(jobs.find(job => job.id === jobId)).toMatchObject({
        data: {
          evidenceId: notification.evidenceId,
          purchaseTokenLookupSha256,
          environment: notification.environment,
        },
        opts: {
          priority: 10,
          deduplication: { id: jobId, mode: 'simple' },
          ordering: {
            key: `google-play-token:${notification.environment}:${purchaseTokenLookupSha256}`,
            concurrency: 1,
          },
        },
      })
    }
    for (const acknowledgementId of acknowledgementIds) {
      const jobId = `google-play-acknowledgement__${acknowledgementId}`
      expect(jobs.find(job => job.id === jobId)).toMatchObject({
        data: { acknowledgementId },
        opts: { priority: 10, deduplication: { id: jobId, mode: 'simple' } },
      })
    }
    for (const sourceId of sourceIds) {
      const jobId = `google-play-active-source__${sourceId}__${bucket}`
      expect(jobs.find(job => job.id === jobId)).toMatchObject({
        data: { sourceId },
        opts: {
          priority: 10,
          deduplication: { id: jobId, mode: 'simple' },
          ordering: { key: `google-play-source:${sourceId}`, concurrency: 1 },
        },
      })
    }
    const payloads = jobs.map(job => ({ data: job.data, opts: job.opts }))
    for (const notification of notifications)
      expect(JSON.stringify(payloads)).not.toContain(notification.purchaseToken)
  })

  it('throttles each recovery and trust-refresh scan to its own interval', async () => {
    const now = 1_800_000_000_123
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now)
    try {
      await enqueueRecoverGooglePlayNotifications()
      await enqueueRecoverGooglePlayAcknowledgements()
      await enqueueRecoverGooglePlayActiveSources()
      await enqueueRefreshGooglePlayOidcTrust()
      const jobs = await queuedJobs()
      for (const [prefix, intervalMs] of [
        ['google-play-notification-recovery', 300_000],
        ['google-play-acknowledgement-recovery', 300_000],
        ['google-play-active-source-recovery', 3_600_000],
        ['google-play-oidc-refresh', 10_800_000],
      ] as const) {
        const id = `${prefix}__${Math.floor(now / intervalMs)}`
        expect(jobs.find(job => job.id === id)).toMatchObject({
          data: {},
          opts: { deduplication: { id: prefix, mode: 'throttle', ttl: intervalMs } },
        })
      }
    } finally {
      dateNow.mockRestore()
    }
  })
})
