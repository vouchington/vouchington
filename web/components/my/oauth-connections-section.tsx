'use client'

import { getBrowserRuntimePublicConfig, getOAuthProviders } from '@/lib/runtime-public-config'
import { useConfiguredOAuthProviders } from '@/components/auth/use-configured-oauth-providers'
import type { OAuthAccountInfo, OAuthProvider } from '@/types/user'
import { OAuthConnection } from './oauth-connection'

const OAUTH_PROVIDERS: OAuthProvider[] = [
  'facebook',
  'apple',
  'google',
  'x',
  'linkedin',
  'microsoft',
  'github',
]

interface Props {
  accounts: Record<OAuthProvider, OAuthAccountInfo | null>
}

export function OAuthConnectionsSection({ accounts }: Props) {
  const runtimePublicProviders = getOAuthProviders(getBrowserRuntimePublicConfig())
  const { providers: configuredProviders, brokerCapabilities } =
    useConfiguredOAuthProviders(runtimePublicProviders)

  return (
    <>
      {OAUTH_PROVIDERS.map((provider, index) => (
        <OAuthConnection
          key={provider}
          separator={index > 0}
          provider={provider}
          initialAccount={accounts[provider]}
          providerConfigured={configuredProviders.includes(provider)}
          brokerEnabled={
            (provider === 'facebook' || provider === 'x' || provider === 'github') &&
            Boolean(brokerCapabilities[provider]?.modes.web)
          }
        />
      ))}
    </>
  )
}
