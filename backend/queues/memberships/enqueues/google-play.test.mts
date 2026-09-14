import { createHash, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memberships } from '../queues.mts'
import {
  enqueueAcknowledgeGooglePlayPurchase,
  enqueueProcessGooglePlayNotification,
  enqueueReconcileGooglePlayActiveSource,
  enqueueRecoverGooglePlayAcknowledgements,
  enqueueRecoverGooglePlayActiveSources,
  enqueueRecoverGooglePlayNotifications,
  enqueueRefreshGooglePlayOidcTrust,
} from './google-play.mts'

const queueStates = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const
const queuedJobs = async () =>
  (await Promise.all(queueStates.map(state => memberships.getJobs(state)))).flat()

describe('Google Play membership enqueues', () => {
  afterEach(() => memberships.obliterate({ force: true }))

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
    expect(JSON.stringify(await queuedJobs())).not.toContain(purchaseToken)
  })

  it('deduplicates acknowledgement and source reconciliation by stable identity', async () => {
    const acknowledgementId = randomUUID()
    const sourceId = randomUUID()
    await enqueueAcknowledgeGooglePlayPurchase({ acknowledgementId })
    await enqueueReconcileGooglePlayActiveSource({ sourceId })
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
