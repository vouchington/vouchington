import { createApp, type Application, type ApplicationOptions } from '@jongleberry/api-server'
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
  return createApp(VOUCHA_API_SERVER_OPTIONS)
}
