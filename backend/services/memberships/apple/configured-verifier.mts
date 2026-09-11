import { getAppleAppStoreRootCertificates } from '@voucha/config/apple-app-store-root-certificates'
import type { AppleMembershipProviderEnvironment } from './types.mts'
import {
  createAppleSignedTransactionEvidenceVerifier,
  createAppleTransactionVerifier,
  type AppleTransactionVerifier,
} from './verify-transaction.mts'

export function createConfiguredAppleTransactionVerifier(options: {
  applicationId: string
  appAppleId?: number
  environment: AppleMembershipProviderEnvironment
}): AppleTransactionVerifier {
  return createAppleTransactionVerifier({
    appleRootCertificates: getAppleAppStoreRootCertificates(),
    applicationId: options.applicationId,
    appAppleId: options.appAppleId ?? getConfiguredAppleAppStoreId(options.environment),
    environment: options.environment,
  })
}

export function createConfiguredAppleSignedTransactionEvidenceVerifier(options: {
  applicationId: string
  appAppleId?: number
  environment: AppleMembershipProviderEnvironment
}): ReturnType<typeof createAppleSignedTransactionEvidenceVerifier> {
  return createAppleSignedTransactionEvidenceVerifier({
    appleRootCertificates: getAppleAppStoreRootCertificates(),
    applicationId: options.applicationId,
    appAppleId: options.appAppleId ?? getConfiguredAppleAppStoreId(options.environment),
    environment: options.environment,
  })
}

export function getConfiguredAppleAppStoreId(
  environment: AppleMembershipProviderEnvironment,
): number | undefined {
  if (environment === 'test') return undefined
  const rawAppId = process.env.APPLE_APP_STORE_APP_ID
  const appId = rawAppId ? Number(rawAppId) : Number.NaN
  if (!Number.isSafeInteger(appId) || appId <= 0)
    throw new Error('APPLE_APP_STORE_APP_ID must be a positive integer in production')
  return appId
}
