import {
  Environment,
  InAppOwnershipType,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library'
import type { MembershipVerificationReasonCode } from '../verification-contract.mts'
import type {
  AppleMembershipProviderEnvironment,
  AppleSignedTransactionEvidence,
  AppleSignedTransactionExpectation,
  AppleSignedTransactionVerificationResult,
  AppleSignedTransactionVerifierConfig,
  AppleTransactionVerifier,
  AppleTransactionVerifierFactory,
  RejectedAppleSignedTransactionVerification,
} from './types.mts'

export type {
  AppleSignedTransactionExpectation,
  AppleSignedTransactionVerificationResult,
  AppleSignedTransactionVerifierConfig,
  AppleTransactionVerifier,
  AppleTransactionVerifierFactory,
} from './types.mts'

export function createAppleTransactionVerifier(
  config: AppleSignedTransactionVerifierConfig,
): AppleTransactionVerifier {
  return new SignedDataVerifier(
    config.appleRootCertificates,
    config.enableOnlineChecks ?? false,
    toAppleEnvironment(config.environment),
    config.applicationId,
    config.appAppleId,
  )
}

export function createAppleSignedTransactionEvidenceVerifier(
  config: AppleSignedTransactionVerifierConfig,
  createVerifier: AppleTransactionVerifierFactory = createAppleTransactionVerifier,
): {
  verify(
    evidence: unknown,
    expected: AppleSignedTransactionExpectation,
    now?: Date,
  ): Promise<AppleSignedTransactionVerificationResult>
} {
  const verifier = createVerifier({
    ...config,
    enableOnlineChecks: config.enableOnlineChecks ?? false,
  })
  return {
    verify(evidence, expected, now = new Date()) {
      return verifyAppleSignedTransactionEvidence({ evidence, expected, now, verifier })
    },
  }
}

export async function verifyAppleSignedTransactionEvidence(options: {
  evidence: unknown
  expected: AppleSignedTransactionExpectation
  now?: Date
  verifier: AppleTransactionVerifier
}): Promise<AppleSignedTransactionVerificationResult> {
  const signedTransactionInfo = getSignedTransactionInfo(options.evidence)
  if (!signedTransactionInfo) return rejected('invalid_evidence')

  let transaction: JWSTransactionDecodedPayload
  try {
    transaction = await options.verifier.verifyAndDecodeTransaction(signedTransactionInfo)
  } catch {
    return rejected('invalid_evidence')
  }

  return normalizeAppleTransaction(transaction, options.expected, options.now ?? new Date())
}

function normalizeAppleTransaction(
  transaction: JWSTransactionDecodedPayload,
  expected: AppleSignedTransactionExpectation,
  now: Date,
): AppleSignedTransactionVerificationResult {
  const originalTransactionId = getRequiredText(transaction.originalTransactionId)
  const transactionId = getRequiredText(transaction.transactionId)
  const bundleId = getRequiredText(transaction.bundleId)
  const productId = getRequiredText(transaction.productId)
  if (!originalTransactionId || !transactionId || !bundleId || !productId)
    return rejected('invalid_evidence')
  if (bundleId !== expected.applicationId) return rejected('wrong_application')
  if (transaction.environment !== toAppleEnvironment(expected.environment))
    return rejected('wrong_environment')
  if (productId !== expected.expectedProduct.providerProductId) return rejected('wrong_product')

  const ownership = getSourceKind(
    transaction.inAppOwnershipType,
    transaction.appAccountToken,
    expected,
  )
  if (!ownership.accepted) return ownership

  const purchaseDate = getValidDate(transaction.purchaseDate)
  const expiresDate = getValidDate(transaction.expiresDate)
  const signedDate = getValidDate(transaction.signedDate)
  if (!purchaseDate || !expiresDate || !signedDate || expiresDate < purchaseDate)
    return rejected('invalid_evidence')
  if (purchaseDate > now || signedDate > now) return rejected('purchase_pending')

  const revocationDate =
    transaction.revocationDate === undefined ? null : getValidDate(transaction.revocationDate)
  if (
    transaction.revocationDate !== undefined &&
    (!revocationDate || revocationDate < purchaseDate)
  )
    return rejected('invalid_evidence')

  const lifecycle = revocationDate ? 'revoked' : expiresDate <= now ? 'expired' : 'active'
  const terminalAt = revocationDate ?? (lifecycle === 'expired' ? expiresDate : null)
  return {
    accepted: true,
    observation: {
      provider: 'apple_app_store',
      environment: expected.environment,
      applicationId: expected.applicationId,
      membershipProductId: expected.expectedProduct.membershipProductId,
      providerProductId: productId,
      providerLineageId: originalTransactionId,
      providerEventId: transactionId,
      providerRevision: transactionId,
      providerOrder: 0,
      sourceKind: ownership.sourceKind,
      appAccountToken: ownership.appAccountToken,
      effectiveAt: purchaseDate,
      expiresAt: expiresDate,
      terminalAt,
      lifecycle,
      autoRenews: false,
    },
  }
}

function getSourceKind(
  ownership: JWSTransactionDecodedPayload['inAppOwnershipType'],
  appAccountToken: string | undefined,
  expected: AppleSignedTransactionExpectation,
):
  | { accepted: true; sourceKind: 'direct' | 'family'; appAccountToken: string | null }
  | RejectedAppleSignedTransactionVerification {
  if (ownership === InAppOwnershipType.FAMILY_SHARED)
    return { accepted: true, sourceKind: 'family', appAccountToken: null }
  if (ownership !== InAppOwnershipType.PURCHASED) return rejected('invalid_evidence')
  const token = getRequiredText(appAccountToken)
  if (!token) return rejected('missing_account_token')
  if (expected.purchaseIntentId && token !== expected.purchaseIntentId)
    return rejected('wrong_account')
  return { accepted: true, sourceKind: 'direct', appAccountToken: token }
}

function getSignedTransactionInfo(evidence: unknown): string | null {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return null
  const keys = Object.keys(evidence)
  if (keys.length !== 1 || keys[0] !== 'signed_transaction_info') return null
  const signedTransactionInfo = (evidence as AppleSignedTransactionEvidence).signed_transaction_info
  return getRequiredText(signedTransactionInfo)
}

function getRequiredText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function getValidDate(value: unknown): Date | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function rejected(
  reasonCode: MembershipVerificationReasonCode,
): RejectedAppleSignedTransactionVerification {
  return { accepted: false, reasonCode }
}

function toAppleEnvironment(environment: AppleMembershipProviderEnvironment): Environment {
  return environment === 'test' ? Environment.SANDBOX : Environment.PRODUCTION
}
