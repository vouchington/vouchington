import type { NamedQueueJob } from '@data-stores/valkey-glide-mq'
import type { Job } from 'glide-mq'
import { processMembershipProviderJob } from './membership-provider-job.mts'
import { deferPostgresConnectionTimeout } from '@vouchington/queue-errors'
import type { MembershipsJobPayloads } from '@queues/memberships/types'
import { reconcileAppleNotification } from '@services/memberships/apple/reconcile-notification'
import {
  deliverPendingMembershipEntitlementEffects,
  resumeExpireElapsedMemberships,
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

type MembershipJob = NamedQueueJob<MembershipsJobPayloads>

export function processMembershipJob(job: Job<unknown>): Promise<void> {
  return deferPostgresConnectionTimeout(job, () => dispatchMembershipJob(job as MembershipJob))
}

async function dispatchMembershipJob(job: MembershipJob): Promise<void> {
  const jobName: string = job.name
  switch (job.name) {
    case 'recoverStripePurchaseCollisions':
      await recoverStripePurchaseCollisions(job)
      return
    case 'processStripePurchaseCollisionWork':
      await processStripePurchaseCollisionWork(job.data.workId)
      return
    case 'deliverMembershipEntitlementEffects':
      await deliverPendingMembershipEntitlementEffects()
      return
    case 'expireElapsedMemberships':
      await resumeExpireElapsedMemberships()
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
      await processRenewalNotificationCheckDispatcher(job.data)
      return
    case 'processSendRenewalPriceIncreaseEmail':
      await processSendRenewalPriceIncreaseEmail(job.data)
      return
    case 'dispatchMembershipRefundReconciliation':
      await dispatchMembershipRefundReconciliation()
      return
    case 'reconcileMembershipRefundOperation':
      await reconcileMembershipRefundOperation({
        id: job.data.operationId,
        leaseToken: job.data.leaseToken,
      })
      return
    case 'dispatchMembershipPauseCollection':
      await dispatchMembershipPauseCollection()
      return
    case 'syncMembershipPauseCollection':
      await syncMembershipPauseCollection(job.data)
      return
    default:
      throw new Error(`Unknown job name: ${jobName}`)
  }
}
