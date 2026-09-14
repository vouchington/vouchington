import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import type { enqueueBulkProcessStripeEvents } from '@queues/memberships/enqueues'
import { memberships } from '@queues/memberships/queues'
import type { reconcileAppleNotification } from '@services/memberships/apple/reconcile-notification'
import {
  claimAdministratorRefundRequest,
  leaseDueRefundReconciliation,
  scheduleRefundReconciliationRetry,
  type deliverPendingMembershipEntitlementEffects,
  type expireElapsedMembershipsBatch,
  type reconcileMembershipRefundOperation,
  type reconcileStripeMembershipCatalog,
} from '@services/memberships'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import type { processMembershipVerification } from '@services/memberships/process-verification'
import type { claimRecoverableStripeEvents } from '@services/stripe/recovery'
import { cleanupRefundReconciliationOperationsForTest } from '../../../test-helpers/entities/membership-refund-reconciliation-state.mts'
import { readAllQueueJobs } from '../../../test-helpers/queue-jobs.mts'
import type { processRenewalNotificationCheckDispatcher } from './renewal-notification-check.mts'
import type { processSendRenewalPriceIncreaseEmail } from './send-renewal-price-increase-email.mts'
import type { recoverMembershipVerifications } from './verification-recovery.mts'
import type { recoverAppleNotifications } from './apple-notification-recovery.mts'
import type {
  processGooglePlayNotification,
  recoverGooglePlayNotifications,
  recoverGooglePlayActiveSources,
  processGooglePlayActiveSource,
  processGooglePlayAcknowledgement,
  recoverGooglePlayAcknowledgements,
  refreshConfiguredGoogleOidcTrustMaterial,
} from './google-play.mts'
import type {
  processMicrosoftStoreSource,
  recoverMicrosoftStoreSources,
} from './microsoft-store.mts'
import { processMembershipJob } from './process-job.mts'
import { type processStripeEvent, recoverStripeEvents } from './stripe-event.mts'

describe('processMembershipJob', () => {
  it('routes every membership job', async () => {
    const processors = {
      deliverMembershipEntitlementEffects:
        vi.fn<typeof deliverPendingMembershipEntitlementEffects>(),
      expireElapsedMemberships: vi.fn<typeof expireElapsedMembershipsBatch>(),
      processAppleNotification: vi.fn<typeof reconcileAppleNotification>(),
      processMembershipVerification: vi.fn<typeof processMembershipVerification>(),
      processRenewalNotificationCheckDispatcher:
        vi.fn<typeof processRenewalNotificationCheckDispatcher>(),
      processSendRenewalPriceIncreaseEmail: vi.fn<typeof processSendRenewalPriceIncreaseEmail>(),
      processStripeEvent: vi.fn<typeof processStripeEvent>(),
      recoverMembershipVerifications: vi.fn<typeof recoverMembershipVerifications>(),
      recoverAppleNotifications: vi.fn<typeof recoverAppleNotifications>(),
      processGooglePlayNotification: vi.fn<typeof processGooglePlayNotification>(),
      recoverGooglePlayNotifications: vi.fn<typeof recoverGooglePlayNotifications>(),
      recoverGooglePlayActiveSources: vi.fn<typeof recoverGooglePlayActiveSources>(),
      processGooglePlayActiveSource: vi.fn<typeof processGooglePlayActiveSource>(),
      processGooglePlayAcknowledgement: vi.fn<typeof processGooglePlayAcknowledgement>(),
      recoverGooglePlayAcknowledgements: vi.fn<typeof recoverGooglePlayAcknowledgements>(),
      refreshGooglePlayOidcTrust: vi.fn<typeof refreshConfiguredGoogleOidcTrustMaterial>(),
      recoverMicrosoftStoreSources: vi.fn<typeof recoverMicrosoftStoreSources>(),
      reconcileMicrosoftStoreSource: vi.fn<typeof processMicrosoftStoreSource>(),
      recoverStripeEvents: vi.fn<typeof recoverStripeEvents>(),
      reconcileStripeMembershipCatalog: vi.fn<typeof reconcileStripeMembershipCatalog>(),
      dispatchMembershipRefundReconciliation: vi.fn<() => Promise<void>>(),
      reconcileMembershipRefundOperation: vi.fn<typeof reconcileMembershipRefundOperation>(),
    }
    const stripeData = {
      stripeEventRecordId: 'event-1',
      processingAttemptId: 'attempt-1',
      stripeSubscriptionId: 'sub-1',
      livemode: false,
    }
    const renewalData = { membershipId: 'membership-1' }
    const appleData = {
      evidenceId: 'evidence-1',
      providerLineageId: 'lineage-1',
      environment: 'test' as const,
    }

    await processMembershipJob(job('processStripeEvent', stripeData), processors)
    await processMembershipJob(job('deliverMembershipEntitlementEffects'), processors)
    await processMembershipJob(job('expireElapsedMemberships'), processors)
    await processMembershipJob(
      job('processMembershipVerification', { verificationId: 'verification-1' }),
      processors,
    )
    await processMembershipJob(job('processAppleNotification', appleData), processors)
    await processMembershipJob(job('recoverStripeEvents'), processors)
    await processMembershipJob(job('recoverMembershipVerifications'), processors)
    await processMembershipJob(job('recoverAppleNotifications'), processors)
    const googleData = { evidenceId: 'google-evidence-1' }
    const acknowledgementData = { acknowledgementId: 'google-ack-1' }
    await processMembershipJob(job('processGooglePlayNotification', googleData), processors)
    await processMembershipJob(job('recoverGooglePlayNotifications'), processors)
    await processMembershipJob(job('recoverGooglePlayActiveSources'), processors)
    await processMembershipJob(
      job('reconcileGooglePlayActiveSource', { sourceId: 'google-source-1' }),
      processors,
    )
    await processMembershipJob(
      job('acknowledgeGooglePlayPurchase', acknowledgementData),
      processors,
    )
    await processMembershipJob(job('recoverGooglePlayAcknowledgements'), processors)
    await processMembershipJob(job('refreshGooglePlayOidcTrust'), processors)
    await processMembershipJob(job('recoverMicrosoftStoreSources'), processors)
    await processMembershipJob(
      job('reconcileMicrosoftStoreSource', { sourceId: 'microsoft-source-1' }),
      processors,
    )
    await processMembershipJob(job('reconcileStripeMembershipCatalog'), processors)
    await processMembershipJob(job('processRenewalNotificationCheck'), processors)
    await processMembershipJob(job('processSendRenewalPriceIncreaseEmail', renewalData), processors)
    await processMembershipJob(job('dispatchMembershipRefundReconciliation'), processors)
    await processMembershipJob(
      job('reconcileMembershipRefundOperation', {
        operationId: 'operation-1',
        leaseToken: 'lease-token-1',
      }),
      processors,
    )

    expect(processors.processStripeEvent).toHaveBeenCalledWith(stripeData, true)
    expect(processors.deliverMembershipEntitlementEffects).toHaveBeenCalledOnce()
    expect(processors.expireElapsedMemberships).toHaveBeenCalledOnce()
    expect(processors.processMembershipVerification).toHaveBeenCalledWith('verification-1')
    expect(processors.processAppleNotification).toHaveBeenCalledWith(appleData)
    expect(processors.recoverStripeEvents).toHaveBeenCalledOnce()
    expect(processors.recoverMembershipVerifications).toHaveBeenCalledOnce()
    expect(processors.recoverAppleNotifications).toHaveBeenCalledOnce()
    expect(processors.processGooglePlayNotification).toHaveBeenCalledWith(googleData)
    expect(processors.recoverGooglePlayNotifications).toHaveBeenCalledOnce()
    expect(processors.recoverGooglePlayActiveSources).toHaveBeenCalledOnce()
    expect(processors.processGooglePlayActiveSource).toHaveBeenCalledWith({
      sourceId: 'google-source-1',
    })
    expect(processors.processGooglePlayAcknowledgement).toHaveBeenCalledWith(acknowledgementData)
    expect(processors.recoverGooglePlayAcknowledgements).toHaveBeenCalledOnce()
    expect(processors.refreshGooglePlayOidcTrust).toHaveBeenCalledOnce()
    expect(processors.recoverMicrosoftStoreSources).toHaveBeenCalledOnce()
    expect(processors.reconcileMicrosoftStoreSource).toHaveBeenCalledWith({
      sourceId: 'microsoft-source-1',
    })
    expect(processors.reconcileStripeMembershipCatalog).toHaveBeenCalledOnce()
    expect(processors.processRenewalNotificationCheckDispatcher).toHaveBeenCalledOnce()
    expect(processors.processSendRenewalPriceIncreaseEmail).toHaveBeenCalledWith(renewalData)
    expect(processors.dispatchMembershipRefundReconciliation).toHaveBeenCalledOnce()
    expect(processors.reconcileMembershipRefundOperation).toHaveBeenCalledWith({
      id: 'operation-1',
      leaseToken: 'lease-token-1',
    })
  })

  it('rejects unknown jobs', async () => {
    await expect(
      processMembershipJob(job('unknown'), {
        deliverMembershipEntitlementEffects:
          vi.fn<typeof deliverPendingMembershipEntitlementEffects>(),
        expireElapsedMemberships: vi.fn<typeof expireElapsedMembershipsBatch>(),
        processAppleNotification: vi.fn<typeof reconcileAppleNotification>(),
        processMembershipVerification: vi.fn<typeof processMembershipVerification>(),
        processRenewalNotificationCheckDispatcher:
          vi.fn<typeof processRenewalNotificationCheckDispatcher>(),
        processSendRenewalPriceIncreaseEmail: vi.fn<typeof processSendRenewalPriceIncreaseEmail>(),
        processStripeEvent: vi.fn<typeof processStripeEvent>(),
        recoverMembershipVerifications: vi.fn<typeof recoverMembershipVerifications>(),
        recoverAppleNotifications: vi.fn<typeof recoverAppleNotifications>(),
        processGooglePlayNotification: vi.fn<typeof processGooglePlayNotification>(),
        recoverGooglePlayNotifications: vi.fn<typeof recoverGooglePlayNotifications>(),
        recoverGooglePlayActiveSources: vi.fn<typeof recoverGooglePlayActiveSources>(),
        processGooglePlayActiveSource: vi.fn<typeof processGooglePlayActiveSource>(),
        processGooglePlayAcknowledgement: vi.fn<typeof processGooglePlayAcknowledgement>(),
        recoverGooglePlayAcknowledgements: vi.fn<typeof recoverGooglePlayAcknowledgements>(),
        refreshGooglePlayOidcTrust: vi.fn<typeof refreshConfiguredGoogleOidcTrustMaterial>(),
        recoverMicrosoftStoreSources: vi.fn<typeof recoverMicrosoftStoreSources>(),
        reconcileMicrosoftStoreSource: vi.fn<typeof processMicrosoftStoreSource>(),
        recoverStripeEvents: vi.fn<typeof recoverStripeEvents>(),
        reconcileStripeMembershipCatalog: vi.fn<typeof reconcileStripeMembershipCatalog>(),
        dispatchMembershipRefundReconciliation: vi.fn<() => Promise<void>>(),
        reconcileMembershipRefundOperation: vi.fn<typeof reconcileMembershipRefundOperation>(),
      }),
    ).rejects.toThrow('Unknown job name: unknown')
  })

  it('dispatches due refund reconciliations through the default processor', async () => {
    const [member, administrator] = await Promise.all([createTestUser(), createTestUser()])
    const membership = await createTestMembership({
      user_id: member.id,
      stripe_subscription_id: `sub_worker_dispatch_${randomUUID()}`,
    })
    const operation = await claimAdministratorRefundRequest({
      amount: { amount: 700, currency: 'usd' },
      cancelRequested: false,
      idempotencyKey: `worker-dispatch-${randomUUID()}`,
      issuedById: administrator.id,
      membershipId: membership.id,
      note: null,
      periodEndsAt: null,
      periodStartedAt: null,
      providerPaymentReference: `ch_worker_dispatch_${randomUUID()}`,
      providerSubscriptionReference: null,
      reason: 'requested',
      requestFingerprint: randomUUID().replaceAll('-', '').padEnd(64, '0'),
    })
    const lease = await leaseDueRefundReconciliation(operation.id)
    if (!lease) throw new Error('Expected reconciliation lease')
    await scheduleRefundReconciliationRetry(lease, new Date('1900-01-01'), 'worker test setup')

    try {
      await processMembershipJob(job('dispatchMembershipRefundReconciliation'))

      await expect
        .poll(async () => readAllQueueJobs(memberships), { timeout: 5_000 })
        .toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({ operationId: operation.id }),
              name: 'reconcileMembershipRefundOperation',
            }),
          ]),
        )
    } finally {
      await cleanupRefundReconciliationOperationsForTest([operation.id])
      await memberships.obliterate({ force: true })
    }
  })
})

describe('recoverStripeEvents', () => {
  it('enqueues every claimed database attempt', async () => {
    const events = [
      {
        stripeEventRecordId: 'event-1',
        processingAttemptId: 'attempt-1',
        stripeSubscriptionId: 'sub-1',
        livemode: false,
      },
    ]
    const claim = vi.fn<typeof claimRecoverableStripeEvents>().mockResolvedValue(events)
    const enqueue = vi.fn<typeof enqueueBulkProcessStripeEvents>().mockResolvedValue([])

    await expect(
      recoverStripeEvents({
        claimRecoverableStripeEvents: claim,
        enqueueBulkProcessStripeEvents: enqueue,
      }),
    ).resolves.toEqual({ enqueued: 1 })
    expect(enqueue).toHaveBeenCalledWith(events)
  })

  it('does not enqueue an empty recovery batch', async () => {
    const claim = vi.fn<typeof claimRecoverableStripeEvents>().mockResolvedValue([])
    const enqueue = vi.fn<typeof enqueueBulkProcessStripeEvents>()

    await expect(
      recoverStripeEvents({
        claimRecoverableStripeEvents: claim,
        enqueueBulkProcessStripeEvents: enqueue,
      }),
    ).resolves.toEqual({ enqueued: 0 })
    expect(enqueue).not.toHaveBeenCalled()
  })
})

function job(name: string, data: Record<string, unknown> = {}): Job {
  return { name, data, attemptsMade: 2, opts: { attempts: 3 } } as Job
}
