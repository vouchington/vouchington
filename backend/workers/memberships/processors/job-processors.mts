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

export type MembershipJobProcessors = {
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
  dispatchMembershipPauseCollection: typeof dispatchMembershipPauseCollection
  syncMembershipPauseCollection: typeof syncMembershipPauseCollection
}

export const PROCESSORS: MembershipJobProcessors = {
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
  dispatchMembershipPauseCollection,
  syncMembershipPauseCollection,
}

async function dispatchMembershipPauseCollection(): Promise<void> {
  const leases = await dispatchDuePauseCollectionWork()
  await Promise.all(leases.map(lease => enqueueSyncMembershipPauseCollection(lease)))
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
