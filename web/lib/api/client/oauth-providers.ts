'use client'

import type { BrokerOAuthProvider } from '@/lib/auth/oauth-broker-provider'
import type { OAuthProvider } from '@/types/user'
import { clientApi } from './instance'

export interface OAuthProvidersResponse {
  providers: OAuthProvider[]
  broker_capabilities: Partial<
    Record<
      BrokerOAuthProvider,
      {
        version: 1
        modes: { web: boolean; native: boolean }
        purposes: Array<'authenticate' | 'connect'>
      }
    >
  >
}

export function getConfiguredOAuthProviders(): Promise<OAuthProvidersResponse> {
  return clientApi.get<OAuthProvidersResponse>('/api/v1/auth/oauth/providers')
}
