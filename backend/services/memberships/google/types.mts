import type { MembershipVerificationReasonCode } from '../verification-contract.mts'

export type GooglePlayMembershipProviderEnvironment = 'test' | 'production'

export type GooglePlaySubscriptionState =
  | 'SUBSCRIPTION_STATE_PENDING'
  | 'SUBSCRIPTION_STATE_ACTIVE'
  | 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
  | 'SUBSCRIPTION_STATE_CANCELED'
  | 'SUBSCRIPTION_STATE_EXPIRED'
  | 'SUBSCRIPTION_STATE_ON_HOLD'
  | 'SUBSCRIPTION_STATE_PAUSED'
  | 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'
  | 'SUBSCRIPTION_STATE_UNSPECIFIED'

export type GooglePlaySubscriptionV2 = {
  kind?: string
  regionCode?: string
  subscriptionState?: GooglePlaySubscriptionState
  latestOrderId?: string
  startTime?: string
  linkedPurchaseToken?: string
  acknowledgementState?: 'ACKNOWLEDGEMENT_STATE_PENDING' | 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string }
  outOfAppPurchaseContext?: {
    expiredPurchaseToken?: string
    expiredExternalAccountIdentifiers?: { obfuscatedExternalAccountId?: string }
  }
  testPurchase?: Record<string, never>
  lineItems?: Array<{
    productId?: string
    expiryTime?: string
    deferredItemReplacement?: { productId?: string }
    offerDetails?: { basePlanId?: string; offerId?: string }
    autoRenewingPlan?: { autoRenewEnabled?: boolean }
    prepaidPlan?: { allowExtendAfterTime?: string }
  }>
}

export type GooglePlaySubscriptionsV2Client = {
  getSubscription(options: {
    packageName: string
    purchaseToken: string
  }): Promise<GooglePlaySubscriptionV2>
  acknowledgeSubscription(options: {
    packageName: string
    subscriptionId: string
    purchaseToken: string
  }): Promise<void>
}

export type GooglePlayMembershipExpectedProduct = {
  membershipProductId: string
  providerProductId: string
  basePlanId?: string | null
  offerId?: string | null
  expectedObfuscatedAccountId?: string
}

export type GooglePlayMembershipObservation = {
  provider: 'google_play'
  environment: GooglePlayMembershipProviderEnvironment
  applicationId: string
  membershipProductId: string
  providerProductId: string
  providerLineageId: string
  providerEventId: string
  providerRevision: string
  providerOrder: number
  sourceKind: 'direct'
  effectiveAt: Date | null
  expiresAt: Date
  terminalAt: Date | null
  lifecycle: 'active' | 'expired' | 'revoked' | 'paused'
  autoRenews: boolean
}

/** Provider normalization precedes lineage-serialized observation ordering. */
export type GooglePlayVerifiedMembershipObservation = Omit<
  GooglePlayMembershipObservation,
  'providerOrder'
>

export type GooglePlaySubscriptionVerificationResult =
  | {
      accepted: true
      observation: GooglePlayVerifiedMembershipObservation
      acknowledgementPending: boolean
    }
  | { accepted: false; reasonCode: MembershipVerificationReasonCode; bindablePending?: true }

export type GooglePlayRtdn = {
  messageId: string
  packageName: string
  purchaseToken: string
  subscriptionId: string
  eventTime: Date
  notificationType: number
}

export type GoogleOidcTrustMaterial = {
  issuer: string
  audience: string
  serviceAccountEmail: string
  keysById: Readonly<Record<string, GoogleOidcPublicJwk>>
}

export type GoogleOidcPublicJwk = {
  kty: string
  n: string
  e: string
  [key: string]: string | undefined
}
