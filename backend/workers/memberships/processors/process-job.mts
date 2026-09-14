import type { Job } from 'glide-mq'
import type { MembershipsJobs } from '@queues/memberships/types'
import { reconcileAppleNotification } from '@services/memberships/apple/reconcile-notification'
import {
  deliverPendingMembershipEntitlementEffects,
  expireElapsedMembershipsBatch,
  reconcileStripeMembershipCatalog,
  dispatchDueRefundReconciliations,
  reconcileMembershipRefundOperation,
} from '@services/memberships'
import { enqueueReconcileMembershipRefundOperation } from '@queues/memberships/enqueues'
import { processMembershipVerification } from '@services/memberships/process-verification'
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

type MembershipJobProcessors = {
  deliverMembershipEntitlementEffects: typeof deliverPendingMembershipEntitlementEffects
  expireElapsedMemberships: typeof expireElapsedMembershipsBatch
  processAppleNotification: typeof reconcileAppleNotification
  processMembershipVerification: typeof processMembershipVerification
  processRenewalNotificationCheckDispatcher: typeof processRenewalNotificationCheckDispatcher
  processSendRenewalPriceIncreaseEmail: typeof processSendRenewalPriceIncreaseEmail
  processStripeEvent: typeof processStripeEvent
  recoverMembershipVerifications: typeof recoverMembershipVerifications
  recoverAppleNotifications: typeof recoverAppleNotifications
  processGooglePlayNotification: typeof processGooglePlayNotification
  recoverGooglePlayNotifications: typeof recoverGooglePlayNotifications
  recoverGooglePlayActiveSources: typeof recoverGooglePlayActiveSources
  processGooglePlayActiveSource: typeof processGooglePlayActiveSource
  processGooglePlayAcknowledgement: typeof processGooglePlayAcknowledgement
  recoverGooglePlayAcknowledgements: typeof recoverGooglePlayAcknowledgements
  refreshGooglePlayOidcTrust: typeof refreshConfiguredGoogleOidcTrustMaterial
  recoverMicrosoftStoreSources: typeof recoverMicrosoftStoreSources
  reconcileMicrosoftStoreSource: typeof processMicrosoftStoreSource
  recoverStripeEvents: typeof recoverStripeEvents
  reconcileStripeMembershipCatalog: typeof reconcileStripeMembershipCatalog
  dispatchMembershipRefundReconciliation: typeof dispatchMembershipRefundReconciliation
  reconcileMembershipRefundOperation: typeof reconcileMembershipRefundOperation
}

const PROCESSORS: MembershipJobProcessors = {
  deliverMembershipEntitlementEffects: deliverPendingMembershipEntitlementEffects,
  expireElapsedMemberships: expireElapsedMembershipsBatch,
  processAppleNotification: reconcileAppleNotification,
  processMembershipVerification,
  processRenewalNotificationCheckDispatcher,
  processSendRenewalPriceIncreaseEmail,
  processStripeEvent,
  recoverMembershipVerifications,
  recoverAppleNotifications,
  processGooglePlayNotification,
  recoverGooglePlayNotifications,
  recoverGooglePlayActiveSources,
  processGooglePlayActiveSource,
  processGooglePlayAcknowledgement,
  recoverGooglePlayAcknowledgements,
  refreshGooglePlayOidcTrust: refreshConfiguredGoogleOidcTrustMaterial,
  recoverMicrosoftStoreSources,
  reconcileMicrosoftStoreSource: processMicrosoftStoreSource,
  recoverStripeEvents,
  reconcileStripeMembershipCatalog,
  dispatchMembershipRefundReconciliation,
  reconcileMembershipRefundOperation,
}

async function dispatchMembershipRefundReconciliation(): Promise<void> {
  const leases = await dispatchDueRefundReconciliations()
  await Promise.all(
    leases.map(lease =>
      enqueueReconcileMembershipRefundOperation({
        operationId: lease.id,
        leaseToken: lease.leaseToken,
      }),
    ),
  )
}

export async function processMembershipJob(job: Job, processors = PROCESSORS): Promise<void> {
  switch (job.name as MembershipsJobs) {
    case 'deliverMembershipEntitlementEffects':
      await processors.deliverMembershipEntitlementEffects()
      return
    case 'expireElapsedMemberships':
      await processors.expireElapsedMemberships()
      return
    case 'processMembershipVerification':
      await processors.processMembershipVerification(job.data.verificationId)
      return
    case 'processAppleNotification':
      await processors.processAppleNotification(job.data)
      return
    case 'recoverMembershipVerifications':
      await processors.recoverMembershipVerifications()
      return
    case 'recoverAppleNotifications':
      await processors.recoverAppleNotifications()
      return
    case 'processGooglePlayNotification':
      await processors.processGooglePlayNotification(job.data)
      return
    case 'recoverGooglePlayNotifications':
      await processors.recoverGooglePlayNotifications()
      return
    case 'recoverGooglePlayActiveSources':
      await processors.recoverGooglePlayActiveSources()
      return
    case 'reconcileGooglePlayActiveSource':
      await processors.processGooglePlayActiveSource(job.data)
      return
    case 'acknowledgeGooglePlayPurchase':
      await processors.processGooglePlayAcknowledgement(job.data)
      return
    case 'recoverGooglePlayAcknowledgements':
      await processors.recoverGooglePlayAcknowledgements()
      return
    case 'refreshGooglePlayOidcTrust':
      await processors.refreshGooglePlayOidcTrust()
      return
    case 'recoverMicrosoftStoreSources':
      await processors.recoverMicrosoftStoreSources()
      return
    case 'reconcileMicrosoftStoreSource':
      await processors.reconcileMicrosoftStoreSource(job.data)
      return
    case 'processStripeEvent':
      await processors.processStripeEvent(
        job.data,
        job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
      )
      return
    case 'recoverStripeEvents':
      await processors.recoverStripeEvents()
      return
    case 'reconcileStripeMembershipCatalog':
      await processors.reconcileStripeMembershipCatalog()
      return
    case 'processRenewalNotificationCheck':
      await processors.processRenewalNotificationCheckDispatcher()
      return
    case 'processSendRenewalPriceIncreaseEmail':
      await processors.processSendRenewalPriceIncreaseEmail(job.data)
      return
    case 'dispatchMembershipRefundReconciliation':
      await processors.dispatchMembershipRefundReconciliation()
      return
    case 'reconcileMembershipRefundOperation':
      await processors.reconcileMembershipRefundOperation({
        id: (job.data as { operationId: string }).operationId,
        leaseToken: (job.data as { leaseToken: string }).leaseToken,
      })
      return
    default:
      throw new Error(`Unknown job name: ${job.name}`)
  }
}
