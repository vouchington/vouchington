import { Environment } from '@apple/app-store-server-library'
import type { AppleMembershipProviderEnvironment } from './types.mts'

export function toAppleEnvironment(environment: AppleMembershipProviderEnvironment): Environment {
  return environment === 'test' ? Environment.SANDBOX : Environment.PRODUCTION
}
