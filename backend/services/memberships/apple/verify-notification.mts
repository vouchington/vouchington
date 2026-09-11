import { Environment, type ResponseBodyV2DecodedPayload } from '@apple/app-store-server-library'
import type {
  AppleMembershipProviderEnvironment,
  AppleNotificationEvidence,
  AppleNotificationVerifier,
} from './types.mts'

export type VerifiedAppleNotification = {
  notificationId: string
  providerLineageId: string
  signedTransactionInfo: string
  signedPayload: string
}

export async function verifyAppleNotification(options: {
  evidence: unknown
  environment: AppleMembershipProviderEnvironment
  applicationId: string
  verifier: AppleNotificationVerifier
}): Promise<VerifiedAppleNotification | null> {
  const signedPayload = getSignedPayload(options.evidence)
  if (!signedPayload) return null
  let notification: ResponseBodyV2DecodedPayload
  try {
    notification = await options.verifier.verifyAndDecodeNotification(signedPayload)
  } catch {
    return null
  }
  const notificationId = getRequiredText(notification.notificationUUID)
  const data = notification.data
  const signedTransactionInfo = getRequiredText(data?.signedTransactionInfo)
  if (
    !notificationId ||
    !signedTransactionInfo ||
    data?.bundleId !== options.applicationId ||
    data.environment !== toAppleEnvironment(options.environment)
  )
    return null
  try {
    const transaction = await options.verifier.verifyAndDecodeTransaction(signedTransactionInfo)
    if (
      transaction.bundleId !== options.applicationId ||
      transaction.environment !== toAppleEnvironment(options.environment)
    )
      return null
    const providerLineageId = getRequiredText(transaction.originalTransactionId)
    return providerLineageId
      ? { notificationId, providerLineageId, signedTransactionInfo, signedPayload }
      : null
  } catch {
    return null
  }
}

function getSignedPayload(evidence: unknown): string | null {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return null
  const keys = Object.keys(evidence)
  if (keys.length !== 1 || keys[0] !== 'signedPayload') return null
  return getRequiredText((evidence as AppleNotificationEvidence).signedPayload)
}

function getRequiredText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function toAppleEnvironment(environment: AppleMembershipProviderEnvironment): Environment {
  return environment === 'test' ? Environment.SANDBOX : Environment.PRODUCTION
}
