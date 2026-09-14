export type MembershipsJobs =
  | 'processStripeEvent'
  | 'processAppleNotification'
  | 'recoverAppleNotifications'
  | 'processGooglePlayNotification'
  | 'recoverGooglePlayNotifications'
  | 'reconcileGooglePlayActiveSource'
  | 'recoverGooglePlayActiveSources'
  | 'acknowledgeGooglePlayPurchase'
  | 'recoverGooglePlayAcknowledgements'
  | 'refreshGooglePlayOidcTrust'
  | 'recoverMicrosoftStoreSources'
  | 'reconcileMicrosoftStoreSource'
  | 'processMembershipVerification'
  | 'recoverMembershipVerifications'
  | 'recoverStripeEvents'
  | 'reconcileStripeMembershipCatalog'
  | 'deliverMembershipEntitlementEffects'
  | 'expireElapsedMemberships'
  | 'processRenewalNotificationCheck'
  | 'processSendRenewalPriceIncreaseEmail'
  | 'dispatchMembershipRefundReconciliation'
  | 'reconcileMembershipRefundOperation'

export type ProcessStripeEventData = {
  stripeEventRecordId: string
  processingAttemptId: string
  stripeSubscriptionId: string | null
  livemode: boolean
}

export type ProcessMembershipVerificationData = { verificationId: string }

export type ProcessAppleNotificationData = {
  evidenceId: string
  providerLineageId: string
  environment: 'test' | 'production'
}

export type ProcessGooglePlayNotificationData = {
  evidenceId: string
  purchaseTokenLookupSha256: string
  environment: 'test' | 'production'
}

export type AcknowledgeGooglePlayPurchaseData = { acknowledgementId: string }
export type ReconcileGooglePlayActiveSourceData = { sourceId: string }
export type ReconcileMicrosoftStoreSourceData = { sourceId: string }

export type ProcessSendRenewalPriceIncreaseEmailData = {
  userId: string
  membershipId: string
  membershipProviderObservationId: string
}

export type ReconcileMembershipRefundOperationData = {
  operationId: string
  leaseToken: string
}
