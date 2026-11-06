import type { Job } from 'glide-mq'
import { processMembershipProviderJob } from './membership-provider-job.mts'
import { deferPostgresConnectionTimeout } from '@vouchington/queue-errors'
import type { MembershipsJobs } from '@queues/memberships/types'
import { reconcileAppleNotification } from '@services/memberships/apple/reconcile-notification'
import {
  deliverPendingMembershipEntitlementEffects,
  expireElapsedMembershipsBatch,
  reconcileStripeMembershipCatalog,
  dispatchDueRefundReconciliations,
  reconcileMembershipRefundOperation,
  dispatchDuePauseCollectionWork,
  syncMembershipPauseCollection,
} from '@services/memberships'
import {
  enqueueReconcileMembershipRefundOperation,
  enqueueSyncMembershipPauseCollection,
} from '@queues/memberships/enqueues'
import { recoverAppleNotifications } from './apple-notification-recovery.mts'
import {
  processGooglePlayNotification,
  recoverGooglePlayNotifications,
  recoverGooglePlayActiveSources,
  processGooglePlayActiveSource,
  processGooglePlayAcknowledgement,
  recoverGooglePlayAcknowledgements,
  refreshConfiguredGoogleOidcTrustMaterial,
} from './google-play.mts'
import { processRenewalNotificationCheckDispatcher } from './renewal-notification-check.mts'
import { processMicrosoftStoreSource, recoverMicrosoftStoreSources } from './microsoft-store.mts'
import { processSendRenewalPriceIncreaseEmail } from './send-renewal-price-increase-email.mts'
import { processStripeEvent, recoverStripeEvents } from './stripe-event.mts'
import { recoverMembershipVerifications } from './verification-recovery.mts'
import { processMembershipVerificationJob } from './process-verification-job.mts'
import { recoverStripePurchaseCollisions } from './stripe-purchase-collisions.mts'
import { processStripePurchaseCollisionWork } from '@services/memberships/ineligible-stripe-purchase-reversal/process-collision-work'

async function dispatchMembershipPauseCollection(): Promise<void> {
  const leases = await dispatchDuePauseCollectionWork()
  await Promise.all(leases.map(lease => enqueueSyncMembershipPauseCollection(lease)))
}

async function dispatchMembershipRefundReconciliation(): Promise<void> {
  const { dispatches: leases } = await dispatchDueRefundReconciliations()
  await Promise.all(
    leases.map(lease =>
      enqueueReconcileMembershipRefundOperation({
        operationId: lease.id,
        leaseToken: lease.leaseToken,
      }),
    ),
  )
}

export function processMembershipJob(job: Job): Promise<void> {
  return deferPostgresConnectionTimeout(job, () => dispatchMembershipJob(job))
}

async function dispatchMembershipJob(job: Job): Promise<void> {
  switch (job.name as MembershipsJobs) {
    case 'recoverStripePurchaseCollisions':
      await recoverStripePurchaseCollisions(job)
      return
    case 'processStripePurchaseCollisionWork':
      await processStripePurchaseCollisionWork((job.data as { workId: string }).workId)
      return
    case 'deliverMembershipEntitlementEffects':
      await deliverPendingMembershipEntitlementEffects()
      return
    case 'expireElapsedMemberships':
      await expireElapsedMembershipsBatch()
      return
    case 'processMembershipVerification':
      await processMembershipVerificationJob(job)
      return
    case 'processAppleNotification':
      await reconcileAppleNotification(job.data)
      return
    case 'recoverMembershipVerifications':
      await recoverMembershipVerifications(job)
      return
    case 'recoverAppleNotifications':
      await recoverAppleNotifications()
      return
    case 'processGooglePlayNotification':
      await processMembershipProviderJob(job, () => processGooglePlayNotification(job.data))
      return
    case 'recoverGooglePlayNotifications':
      await recoverGooglePlayNotifications()
      return
    case 'recoverGooglePlayActiveSources':
      await recoverGooglePlayActiveSources()
      return
    case 'reconcileGooglePlayActiveSource':
      await processGooglePlayActiveSource(job.data)
      return
    case 'acknowledgeGooglePlayPurchase':
      await processGooglePlayAcknowledgement(job.data)
      return
    case 'recoverGooglePlayAcknowledgements':
      await recoverGooglePlayAcknowledgements()
      return
    case 'refreshGooglePlayOidcTrust':
      await refreshConfiguredGoogleOidcTrustMaterial()
      return
    case 'recoverMicrosoftStoreSources':
      await recoverMicrosoftStoreSources()
      return
    case 'reconcileMicrosoftStoreSource':
      await processMicrosoftStoreSource(job.data)
      return
    case 'processStripeEvent':
      await processStripeEvent(job.data, job.attemptsMade + 1 >= (job.opts.attempts ?? 1))
      return
    case 'recoverStripeEvents':
      await recoverStripeEvents()
      return
    case 'reconcileStripeMembershipCatalog':
      await reconcileStripeMembershipCatalog()
      return
    case 'processRenewalNotificationCheck':
      await processRenewalNotificationCheckDispatcher(job.data as { afterId?: string })
      return
    case 'processSendRenewalPriceIncreaseEmail':
      await processSendRenewalPriceIncreaseEmail(job.data)
      return
    case 'dispatchMembershipRefundReconciliation':
      await dispatchMembershipRefundReconciliation()
      return
    case 'reconcileMembershipRefundOperation':
      await reconcileMembershipRefundOperation({
        id: (job.data as { operationId: string }).operationId,
        leaseToken: (job.data as { leaseToken: string }).leaseToken,
      })
      return
    case 'dispatchMembershipPauseCollection':
      await dispatchMembershipPauseCollection()
      return
    case 'syncMembershipPauseCollection':
      await syncMembershipPauseCollection(job.data)
      return
    default:
      throw new Error(`Unknown job name: ${job.name}`)
  }
}
