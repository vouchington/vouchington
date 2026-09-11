'use client'

import { useRuntimePublicConfig } from '@/lib/runtime-public-config-context'
import { usePopupOAuthAuth } from './oauth-popup-hook'

export function useMicrosoftAuth() {
  const { microsoftClientId, microsoftTenantId } = useRuntimePublicConfig()
  return usePopupOAuthAuth({
    clientId: microsoftClientId ?? '',
    authUrl: () =>
      `https://login.microsoftonline.com/${microsoftTenantId || 'common'}/oauth2/v2.0/authorize`,
    callbackPath: '/auth/callback/microsoft',
    popupName: 'microsoft-oauth',
    provider: 'microsoft',
    providerLabel: 'Microsoft',
    scope: 'openid profile email User.Read',
    responseType: 'code',
    responseMode: 'query',
    pkce: true,
    mapResult: ({ code, codeVerifier, redirectUri }) => ({
      code,
      codeVerifier: codeVerifier!,
      redirectUri,
    }),
  })
}
