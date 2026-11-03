import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import * as appleReconcile from '@services/memberships/apple/reconcile-notification'
import * as membershipsService from '@services/memberships'
import * as appleRecovery from './apple-notification-recovery.mts'
import * as googlePlay from './google-play.mts'
import * as microsoftStore from './microsoft-store.mts'
import { processMembershipJob } from './process-job.mts'
import * as verificationJob from './process-verification-job.mts'
import * as renewalCheck from './renewal-notification-check.mts'
import * as stripeEvent from './stripe-event.mts'
import * as verificationRecovery from './verification-recovery.mts'

type SweepSpy = { mock: { calls: unknown[][] } }

// These processors claim from tables shared with every other test file, or need a signed provider
// payload, so running one for real would take other files' rows or call a provider. Each route is
// proven by spying on the real export that process-job.mts imports; the processors' own behavior
// is covered where they are defined.
const sweepRoutes: [string, () => SweepSpy][] = [
  [
    'deliverMembershipEntitlementEffects',
    () =>
      vi
        .spyOn(membershipsService, 'deliverPendingMembershipEntitlementEffects')
        .mockResolvedValue(undefined as never),
  ],
  [
    'expireElapsedMemberships',
    () =>
      vi
        .spyOn(membershipsService, 'expireElapsedMembershipsBatch')
        .mockResolvedValue(undefined as never),
  ],
  [
    'reconcileStripeMembershipCatalog',
    () =>
      vi
        .spyOn(membershipsService, 'reconcileStripeMembershipCatalog')
        .mockResolvedValue(undefined as never),
  ],
  [
    'recoverAppleNotifications',
    () => vi.spyOn(appleRecovery, 'recoverAppleNotifications').mockResolvedValue({ enqueued: 0 }),
  ],
  [
    'recoverGooglePlayNotifications',
    () => vi.spyOn(googlePlay, 'recoverGooglePlayNotifications').mockResolvedValue(),
  ],
  [
    'recoverGooglePlayActiveSources',
    () => vi.spyOn(googlePlay, 'recoverGooglePlayActiveSources').mockResolvedValue(),
  ],
  [
    'recoverGooglePlayAcknowledgements',
    () => vi.spyOn(googlePlay, 'recoverGooglePlayAcknowledgements').mockResolvedValue(),
  ],
  [
    'refreshGooglePlayOidcTrust',
    () =>
      vi
        .spyOn(googlePlay, 'refreshConfiguredGoogleOidcTrustMaterial')
        .mockResolvedValue(undefined as never),
  ],
  [
    'recoverMicrosoftStoreSources',
    () => vi.spyOn(microsoftStore, 'recoverMicrosoftStoreSources').mockResolvedValue(),
  ],
  [
    'recoverStripeEvents',
    () => vi.spyOn(stripeEvent, 'recoverStripeEvents').mockResolvedValue({ enqueued: 0 }),
  ],
]

describe('processMembershipJob routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(sweepRoutes)('routes %s to its sweep', async (name, spyOnSweep) => {
    const sweep = spyOnSweep()

    await processMembershipJob(job(name))

    expect(sweep.mock.calls).toEqual([[]])
  })

  it('routes recoverMembershipVerifications with its job', async () => {
    const recover = vi
      .spyOn(verificationRecovery, 'recoverMembershipVerifications')
      .mockResolvedValue({ enqueued: 0 })
    const recoveryJob = job('recoverMembershipVerifications', { through: 'through-1' })

    await processMembershipJob(recoveryJob)

    expect(recover).toHaveBeenCalledExactlyOnceWith(recoveryJob)
  })

  it('routes processRenewalNotificationCheck with its cursor', async () => {
    const check = vi
      .spyOn(renewalCheck, 'processRenewalNotificationCheckDispatcher')
      .mockResolvedValue({ hasMore: false })

    await processMembershipJob(job('processRenewalNotificationCheck', { afterId: 'membership-1' }))

    expect(check).toHaveBeenCalledExactlyOnceWith({ afterId: 'membership-1' })
  })

  it('defers a Postgres connection timeout from a routed job', async () => {
    const timeout = new Error('Connection terminated due to connection timeout')
    vi.spyOn(membershipsService, 'expireElapsedMembershipsBatch').mockRejectedValueOnce(timeout)

    await expect(processMembershipJob(job('expireElapsedMemberships'))).rejects.toMatchObject({
      name: 'RateLimitError',
      delayMs: 30_000,
      cause: timeout,
    })
  })

  it('routes processMembershipVerification with its job', async () => {
    const process = vi
      .spyOn(verificationJob, 'processMembershipVerificationJob')
      .mockResolvedValue()
    const verification = job('processMembershipVerification', { verificationId: 'verification-1' })

    await processMembershipJob(verification)

    expect(process).toHaveBeenCalledExactlyOnceWith(verification)
  })

  it('routes processAppleNotification with its data', async () => {
    const reconcile = vi.spyOn(appleReconcile, 'reconcileAppleNotification').mockResolvedValue()
    const appleData = {
      evidenceId: 'evidence-1',
      providerLineageId: 'lineage-1',
      environment: 'test' as const,
    }

    await processMembershipJob(job('processAppleNotification', appleData))

    expect(reconcile).toHaveBeenCalledExactlyOnceWith(appleData)
  })

  it('routes the Google Play and Microsoft Store jobs with their data', async () => {
    const notification = vi.spyOn(googlePlay, 'processGooglePlayNotification').mockResolvedValue()
    const activeSource = vi.spyOn(googlePlay, 'processGooglePlayActiveSource').mockResolvedValue()
    const acknowledgement = vi
      .spyOn(googlePlay, 'processGooglePlayAcknowledgement')
      .mockResolvedValue()
    const microsoftSource = vi
      .spyOn(microsoftStore, 'processMicrosoftStoreSource')
      .mockResolvedValue()

    await processMembershipJob(
      job('processGooglePlayNotification', { evidenceId: 'google-evidence-1' }),
    )
    await processMembershipJob(
      job('reconcileGooglePlayActiveSource', { sourceId: 'google-source-1' }),
    )
    await processMembershipJob(
      job('acknowledgeGooglePlayPurchase', { acknowledgementId: 'google-ack-1' }),
    )
    await processMembershipJob(
      job('reconcileMicrosoftStoreSource', { sourceId: 'microsoft-source-1' }),
    )

    expect(notification).toHaveBeenCalledExactlyOnceWith({ evidenceId: 'google-evidence-1' })
    expect(activeSource).toHaveBeenCalledExactlyOnceWith({ sourceId: 'google-source-1' })
    expect(acknowledgement).toHaveBeenCalledExactlyOnceWith({ acknowledgementId: 'google-ack-1' })
    expect(microsoftSource).toHaveBeenCalledExactlyOnceWith({ sourceId: 'microsoft-source-1' })
  })

  it('routes reconcileMembershipRefundOperation with its lease', async () => {
    const reconcile = vi
      .spyOn(membershipsService, 'reconcileMembershipRefundOperation')
      .mockResolvedValue()

    await processMembershipJob(
      job('reconcileMembershipRefundOperation', {
        operationId: 'operation-1',
        leaseToken: 'lease-token-1',
      }),
    )

    expect(reconcile).toHaveBeenCalledExactlyOnceWith({
      id: 'operation-1',
      leaseToken: 'lease-token-1',
    })
  })

  it('routes syncMembershipPauseCollection with its data', async () => {
    const sync = vi.spyOn(membershipsService, 'syncMembershipPauseCollection').mockResolvedValue()
    const pauseData = { userId: 'user-1', requestedAt: '2026-10-11T00:00:00.000Z' }

    await processMembershipJob(job('syncMembershipPauseCollection', pauseData))

    expect(sync).toHaveBeenCalledExactlyOnceWith(pauseData)
  })

  it('rejects unknown jobs', async () => {
    await expect(processMembershipJob(job('unknown'))).rejects.toThrow('Unknown job name: unknown')
  })
})

function job(name: string, data: Record<string, unknown> = {}): Job {
  return { name, data, timestamp: Date.now(), attemptsMade: 2, opts: { attempts: 3 } } as Job
}
