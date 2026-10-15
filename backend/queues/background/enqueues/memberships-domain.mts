import { defineBackgroundDomain } from './define-job.mts'

// The old queue had no queue-wide cap: its jobs ordered per entity (provider lineage, purchase
// token, source, subscription, user, one catalog key), each key at concurrency 1. Those keys are
// namespaced with the domain at enqueue time, so the group is `entity`. Baseline worker load was 5.
export const MEMBERSHIPS_DOMAIN = defineBackgroundDomain({
  domain: 'memberships',
  group: { kind: 'entity' },
  workerConcurrency: 5,
})

export type EmptyMembershipsJobData = Record<string, never>

export type ProcessStripeEventData = {
  stripeEventRecordId: string
  leaseToken: string
  stripeSubscriptionId: string | null
  isLiveMode: boolean
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

export type RenewalNotificationCheckData = { afterId?: string }
