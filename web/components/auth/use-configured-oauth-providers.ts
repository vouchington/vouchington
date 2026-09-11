'use client'

import { useEffect, useState } from 'react'
import { getConfiguredOAuthProviders, type OAuthProvidersResponse } from '@/lib/api/client'
import onError from '@/lib/on-error'
import type { OAuthProvider } from '@/types/user'

export function useConfiguredOAuthProviders(runtimePublicProviders: OAuthProvider[]): {
  providers: OAuthProvider[]
  brokerCapabilities: OAuthProvidersResponse['broker_capabilities']
} {
  const [configuration, setConfiguration] = useState<OAuthProvidersResponse>({
    providers: [],
    broker_capabilities: {},
  })

  useEffect(() => {
    let ignore = false
    getConfiguredOAuthProviders()
      .then(response => {
        if (!ignore) {
          setConfiguration({
            providers: response.providers,
            broker_capabilities: response.broker_capabilities ?? {},
          })
        }
      })
      .catch(error => {
        if (!ignore) {
          setConfiguration({ providers: [], broker_capabilities: {} })
          onError(error, {
            fallback: 'Unable to load sign-in providers.',
            tags: { form: 'auth-login', action: 'load-oauth-providers' },
          })
        }
      })
    return () => {
      ignore = true
    }
  }, [])

  return {
    providers: configuration.providers.filter(
      provider =>
        runtimePublicProviders.includes(provider) ||
        ((provider === 'facebook' || provider === 'x' || provider === 'github') &&
          Boolean(configuration.broker_capabilities[provider]?.modes.web)),
    ),
    brokerCapabilities: configuration.broker_capabilities,
  }
}
