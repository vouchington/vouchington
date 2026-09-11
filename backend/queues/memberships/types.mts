export type MembershipsJobs =
  | 'processStripeWebhook'
  | 'processAppleNotification'
  | 'recoverAppleNotifications'
  | 'processMembershipVerification'
  | 'recoverMembershipVerifications'
  | 'recoverStripeWebhooks'
  | 'reconcileStripeMembershipCatalog'
  | 'deliverMembershipEntitlementEffects'
  | 'expireElapsedMemberships'
  | 'processRenewalNotificationCheck'
  | 'processSendRenewalPriceIncreaseEmail'

export type ProcessStripeWebhookData = {
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

export type ProcessSendRenewalPriceIncreaseEmailData = {
  userId: string
  membershipId: string
  membershipProviderObservationId: string
}
