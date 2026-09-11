import type {
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
  ResponseBodyV2DecodedPayload,
} from '@apple/app-store-server-library'
import type { MembershipVerificationReasonCode } from '../verification-contract.mts'

export type AppleSignedTransactionEvidence = { signed_transaction_info: string }

export type AppleTransactionVerifier = {
  verifyAndDecodeTransaction(signedTransactionInfo: string): Promise<JWSTransactionDecodedPayload>
}

export type AppleRenewalInfoVerifier = {
  verifyAndDecodeRenewalInfo(signedRenewalInfo: string): Promise<JWSRenewalInfoDecodedPayload>
}

export type AppleNotificationVerifier = AppleTransactionVerifier & {
  verifyAndDecodeNotification(signedPayload: string): Promise<ResponseBodyV2DecodedPayload>
}

export type AppleNotificationEvidence = { signedPayload: string }

export type AppleMembershipProviderEnvironment = 'test' | 'production'

export type AppleSignedTransactionVerifierConfig = {
  appleRootCertificates: Buffer[]
  environment: AppleMembershipProviderEnvironment
  applicationId: string
  appAppleId?: number
  enableOnlineChecks?: boolean
}

export type AppleMembershipExpectedProduct = {
  membershipProductId: string
  providerProductId: string
}

export type AppleSignedTransactionExpectation = {
  applicationId: string
  environment: AppleMembershipProviderEnvironment
  expectedProduct: AppleMembershipExpectedProduct
  purchaseIntentId?: string
}

export type AppleMembershipObservation = {
  provider: 'apple_app_store'
  environment: AppleMembershipProviderEnvironment
  applicationId: string
  membershipProductId: string
  providerProductId: string
  providerLineageId: string
  providerEventId: string
  providerRevision: string
  providerOrder: number
  sourceKind: 'direct' | 'family'
  appAccountToken: string | null
  effectiveAt: Date
  expiresAt: Date
  terminalAt: Date | null
  lifecycle: 'active' | 'expired' | 'revoked'
  autoRenews: boolean
}

export type AppleSignedTransactionVerificationResult =
  | { accepted: true; observation: AppleMembershipObservation }
  | { accepted: false; reasonCode: MembershipVerificationReasonCode }

export type RejectedAppleSignedTransactionVerification = Extract<
  AppleSignedTransactionVerificationResult,
  { accepted: false }
>

export type AppleTransactionVerifierFactory = (
  config: AppleSignedTransactionVerifierConfig,
) => AppleTransactionVerifier
