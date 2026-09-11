import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import type { enqueueBulkProcessStripeWebhooks } from '@queues/memberships/enqueues'
import type { reconcileAppleNotification } from '@services/memberships/apple/reconcile-notification'
import type {
  deliverPendingMembershipEntitlementEffects,
  expireElapsedMembershipsBatch,
  reconcileStripeMembershipCatalog,
} from '@services/memberships'
import type { processMembershipVerification } from '@services/memberships/apple'
import type { claimRecoverableStripeEvents } from '@services/stripe/recovery'
import type { processRenewalNotificationCheckDispatcher } from './renewal-notification-check.mts'
import type { processSendRenewalPriceIncreaseEmail } from './send-renewal-price-increase-email.mts'
import type { recoverMembershipVerifications } from './verification-recovery.mts'
import type { recoverAppleNotifications } from './apple-notification-recovery.mts'
import { processMembershipJob } from './process-job.mts'
import { type processStripeWebhook, recoverStripeWebhooks } from './stripe-webhook.mts'

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
      processStripeWebhook: vi.fn<typeof processStripeWebhook>(),
      recoverMembershipVerifications: vi.fn<typeof recoverMembershipVerifications>(),
      recoverAppleNotifications: vi.fn<typeof recoverAppleNotifications>(),
      recoverStripeWebhooks: vi.fn<typeof recoverStripeWebhooks>(),
      reconcileStripeMembershipCatalog: vi.fn<typeof reconcileStripeMembershipCatalog>(),
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

    await processMembershipJob(job('processStripeWebhook', stripeData), processors)
    await processMembershipJob(job('deliverMembershipEntitlementEffects'), processors)
    await processMembershipJob(job('expireElapsedMemberships'), processors)
    await processMembershipJob(
      job('processMembershipVerification', { verificationId: 'verification-1' }),
      processors,
    )
    await processMembershipJob(job('processAppleNotification', appleData), processors)
    await processMembershipJob(job('recoverStripeWebhooks'), processors)
    await processMembershipJob(job('recoverMembershipVerifications'), processors)
    await processMembershipJob(job('recoverAppleNotifications'), processors)
    await processMembershipJob(job('reconcileStripeMembershipCatalog'), processors)
    await processMembershipJob(job('processRenewalNotificationCheck'), processors)
    await processMembershipJob(job('processSendRenewalPriceIncreaseEmail', renewalData), processors)

    expect(processors.processStripeWebhook).toHaveBeenCalledWith(stripeData, true)
    expect(processors.deliverMembershipEntitlementEffects).toHaveBeenCalledOnce()
    expect(processors.expireElapsedMemberships).toHaveBeenCalledOnce()
    expect(processors.processMembershipVerification).toHaveBeenCalledWith('verification-1')
    expect(processors.processAppleNotification).toHaveBeenCalledWith(appleData)
    expect(processors.recoverStripeWebhooks).toHaveBeenCalledOnce()
    expect(processors.recoverMembershipVerifications).toHaveBeenCalledOnce()
    expect(processors.recoverAppleNotifications).toHaveBeenCalledOnce()
    expect(processors.reconcileStripeMembershipCatalog).toHaveBeenCalledOnce()
    expect(processors.processRenewalNotificationCheckDispatcher).toHaveBeenCalledOnce()
    expect(processors.processSendRenewalPriceIncreaseEmail).toHaveBeenCalledWith(renewalData)
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
        processStripeWebhook: vi.fn<typeof processStripeWebhook>(),
        recoverMembershipVerifications: vi.fn<typeof recoverMembershipVerifications>(),
        recoverAppleNotifications: vi.fn<typeof recoverAppleNotifications>(),
        recoverStripeWebhooks: vi.fn<typeof recoverStripeWebhooks>(),
        reconcileStripeMembershipCatalog: vi.fn<typeof reconcileStripeMembershipCatalog>(),
      }),
    ).rejects.toThrow('Unknown job name: unknown')
  })
})

describe('recoverStripeWebhooks', () => {
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
    const enqueue = vi.fn<typeof enqueueBulkProcessStripeWebhooks>().mockResolvedValue([])

    await expect(
      recoverStripeWebhooks({
        claimRecoverableStripeEvents: claim,
        enqueueBulkProcessStripeWebhooks: enqueue,
      }),
    ).resolves.toEqual({ enqueued: 1 })
    expect(enqueue).toHaveBeenCalledWith(events)
  })

  it('does not enqueue an empty recovery batch', async () => {
    const claim = vi.fn<typeof claimRecoverableStripeEvents>().mockResolvedValue([])
    const enqueue = vi.fn<typeof enqueueBulkProcessStripeWebhooks>()

    await expect(
      recoverStripeWebhooks({
        claimRecoverableStripeEvents: claim,
        enqueueBulkProcessStripeWebhooks: enqueue,
      }),
    ).resolves.toEqual({ enqueued: 0 })
    expect(enqueue).not.toHaveBeenCalled()
  })
})

function job(name: string, data: Record<string, unknown> = {}): Job {
  return { name, data, attemptsMade: 2, opts: { attempts: 3 } } as Job
}
