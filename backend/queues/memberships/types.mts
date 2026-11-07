export type MembershipsJobPayloads = {
  processStripePurchaseCollisionWork: { workId: string }
  recoverStripePurchaseCollisions: RecoverStripePurchaseCollisionsData
  processStripeEvent: ProcessStripeEventData
  processAppleNotification: ProcessAppleNotificationData
  recoverAppleNotifications: Record<string, never>
  processGooglePlayNotification: ProcessGooglePlayNotificationData
  recoverGooglePlayNotifications: Record<string, never>
  reconcileGooglePlayActiveSource: ReconcileGooglePlayActiveSourceData
  recoverGooglePlayActiveSources: Record<string, never>
  acknowledgeGooglePlayPurchase: AcknowledgeGooglePlayPurchaseData
  recoverGooglePlayAcknowledgements: Record<string, never>
  refreshGooglePlayOidcTrust: Record<string, never>
  recoverMicrosoftStoreSources: Record<string, never>
  reconcileMicrosoftStoreSource: ReconcileMicrosoftStoreSourceData
  processMembershipVerification: ProcessMembershipVerificationData
  recoverMembershipVerifications: RecoverMembershipVerificationsData
  recoverStripeEvents: Record<string, never>
  reconcileStripeMembershipCatalog: Record<string, never>
  deliverMembershipEntitlementEffects: Record<string, never>
  expireElapsedMemberships: Record<string, never>
  processRenewalNotificationCheck: { afterId?: string }
  processSendRenewalPriceIncreaseEmail: ProcessSendRenewalPriceIncreaseEmailData
  dispatchMembershipRefundReconciliation: Record<string, never>
  reconcileMembershipRefundOperation: ReconcileMembershipRefundOperationData
  dispatchMembershipPauseCollection: Record<string, never>
  syncMembershipPauseCollection: SyncMembershipPauseCollectionData
}

export type MembershipsJobs = keyof MembershipsJobPayloads

export type ProcessStripeEventData = {
  stripeEventRecordId: string
  leaseToken: string
  stripeSubscriptionId: string | null
  isLiveMode: boolean
}

export type RecoverStripePurchaseCollisionsData = { after?: string; through?: string }

export type RecoverMembershipVerificationsData = { after?: string; through?: string }

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
  generation: string
  userId: string
  membershipId: string
  membershipProviderObservationId: string
}

export type ReconcileMembershipRefundOperationData = {
  operationId: string
  leaseToken: string
}

export type SyncMembershipPauseCollectionData = {
  userId: string
  requestedAt: string
  leaseToken?: string
}
