import { Environment, SignedDataVerifier } from '@apple/app-store-server-library'
import { getAppleAppStoreRootCertificates } from '@voucha/config/apple-app-store-root-certificates'
import { getConfiguredAppleAppStoreId } from './configured-verifier.mts'
import type {
  AppleMembershipProviderEnvironment,
  AppleNotificationVerifier,
  AppleRenewalInfoVerifier,
} from './types.mts'

export type AppleNotificationReconciliationVerifier = AppleNotificationVerifier &
  AppleRenewalInfoVerifier

export function createAppleNotificationVerifier(options: {
  environment: AppleMembershipProviderEnvironment
  applicationId: string
}): AppleNotificationReconciliationVerifier {
  return new SignedDataVerifier(
    getAppleAppStoreRootCertificates(),
    false,
    options.environment === 'test' ? Environment.SANDBOX : Environment.PRODUCTION,
    options.applicationId,
    getConfiguredAppleAppStoreId(options.environment),
  )
}
