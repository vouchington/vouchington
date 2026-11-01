import { createApp, type Application, type ApplicationOptions } from '@jongleberry/api-server'
import onError from '@modules/on-error'
import { installRequestContractEnforcement } from './request-contract-enforcement-helpers.mts'
import { VOUCHA_API_SECURITY_HEADERS } from './security-header-helpers.mts'

const VOUCHA_API_SERVER_OPTIONS = {
  trustProxy: true,
  strictHttpMethods: false,
  bodyLimit: 1024 * 1024,
  oversizedBodyStrategy: 'drain',
  fallbackContentSecurityPolicy: false,
  securityHeaders: VOUCHA_API_SECURITY_HEADERS,
} as const satisfies ApplicationOptions

export function createVouchaApiApp(): Application {
  const app = createApp(VOUCHA_API_SERVER_OPTIONS)
  installRequestContractEnforcement(app, onError)
  return app
}
