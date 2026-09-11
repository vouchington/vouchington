import { DynamicConfig } from '@data-stores/valkey'
import createHttpError from 'http-errors'
import { getConfiguredOAuthProviders } from './config.mts'
import type { OAuthProvider } from './providers.mts'

export const BROKER_OAUTH_PROVIDERS = ['facebook', 'x', 'github'] as const
export const BROKER_CALLBACK_MODES = ['web', 'native'] as const
export const BROKER_PURPOSES = ['authenticate', 'connect'] as const

export type BrokerOAuthProvider = (typeof BROKER_OAUTH_PROVIDERS)[number]
export type BrokerCallbackMode = (typeof BROKER_CALLBACK_MODES)[number]
export type BrokerPurpose = (typeof BROKER_PURPOSES)[number]

type BrokerFlagKey = `${BrokerOAuthProvider}_${BrokerCallbackMode}_enabled`

const fieldTypes = {
  facebook_web_enabled: 'boolean',
  facebook_native_enabled: 'boolean',
  x_web_enabled: 'boolean',
  x_native_enabled: 'boolean',
  github_web_enabled: 'boolean',
  github_native_enabled: 'boolean',
} as const

const defaultFields = {
  facebook_web_enabled: false,
  facebook_native_enabled: false,
  x_web_enabled: false,
  x_native_enabled: false,
  github_web_enabled: false,
  github_native_enabled: false,
} as const satisfies Record<BrokerFlagKey, false>

export const oauthAuthorizationBrokerConfig = new DynamicConfig({
  key: 'oauth-authorization-broker',
  fieldTypes,
  defaultFields,
})

export function isOAuthAuthorizationBrokerEnabled(
  provider: BrokerOAuthProvider,
  callbackMode: BrokerCallbackMode,
  configuredProviders: readonly OAuthProvider[] = getConfiguredOAuthProviders(),
): boolean {
  const key: BrokerFlagKey = `${provider}_${callbackMode}_enabled`
  return (
    oauthAuthorizationBrokerConfig.getFields()[key] === true &&
    configuredProviders.includes(provider)
  )
}

export function assertBrokerOAuthProvider(value: string): BrokerOAuthProvider {
  if (!BROKER_OAUTH_PROVIDERS.includes(value as BrokerOAuthProvider)) {
    throw createHttpError(404, 'OAuth authorization broker provider is unavailable')
  }
  return value as BrokerOAuthProvider
}

export function getOAuthAuthorizationBrokerCapabilities(
  configuredProviders: readonly OAuthProvider[] = getConfiguredOAuthProviders(),
): Record<
  BrokerOAuthProvider,
  {
    version: 1
    modes: Record<BrokerCallbackMode, boolean>
    purposes: readonly BrokerPurpose[]
  }
> {
  return BROKER_OAUTH_PROVIDERS.reduce<
    Record<
      BrokerOAuthProvider,
      {
        version: 1
        modes: Record<BrokerCallbackMode, boolean>
        purposes: readonly BrokerPurpose[]
      }
    >
  >(
    (capabilities, provider) => {
      capabilities[provider] = {
        version: 1 as const,
        modes: {
          web: isOAuthAuthorizationBrokerEnabled(provider, 'web', configuredProviders),
          native: isOAuthAuthorizationBrokerEnabled(provider, 'native', configuredProviders),
        },
        purposes: BROKER_PURPOSES,
      }
      return capabilities
    },
    {} as Record<
      BrokerOAuthProvider,
      {
        version: 1
        modes: Record<BrokerCallbackMode, boolean>
        purposes: readonly BrokerPurpose[]
      }
    >,
  )
}
