import type { OAuthProvider } from '@/types/user'
export { RUNTIME_PUBLIC_CONFIG_READY_EVENT } from '@ts-shared/utils/runtime-sentry-config-script'

export interface RuntimePublicConfig {
  appleClientId?: string
  environment?: string
  facebookAppId?: string
  featureFlagCookieMaxLength?: number
  githubClientId?: string
  googleClientId?: string
  gtmId?: string
  linkedinClientId?: string
  microsoftClientId?: string
  microsoftTenantId?: string
  recaptchaSiteKey?: string
  sentryDsn?: string
  turnstileSiteKey?: string
  webPushPublicKey?: string
  xClientId?: string
}

declare global {
  interface Window {
    __VOUCHA_PUBLIC_CONFIG__?: RuntimePublicConfig
  }
}

export function getBrowserRuntimePublicConfig(): RuntimePublicConfig {
  return getBrowserRuntimePublicConfigIfAvailable() ?? {}
}

export function getBrowserRuntimePublicConfigIfAvailable(): RuntimePublicConfig | undefined {
  if (typeof window === 'undefined') return undefined
  // eslint-disable-next-line no-underscore-dangle -- HTML bootstrap namespace for runtime public config.
  return window.__VOUCHA_PUBLIC_CONFIG__
}

export function getOAuthProviders(config: RuntimePublicConfig): OAuthProvider[] {
  return [
    Boolean(config.facebookAppId) && 'facebook',
    Boolean(config.appleClientId) && 'apple',
    Boolean(config.googleClientId) && 'google',
    Boolean(config.xClientId) && 'x',
    Boolean(config.linkedinClientId) && 'linkedin',
    Boolean(config.microsoftClientId) && 'microsoft',
    Boolean(config.githubClientId) && 'github',
  ].filter(Boolean) as OAuthProvider[]
}
