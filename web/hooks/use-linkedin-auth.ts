'use client'

import { useRuntimePublicConfig } from '@/lib/runtime-public-config-context'
import { usePopupOAuthAuth } from './oauth-popup-hook'

export function useLinkedInAuth() {
  const { linkedinClientId } = useRuntimePublicConfig()
  return usePopupOAuthAuth({
    clientId: linkedinClientId ?? '',
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    callbackPath: '/auth/callback/linkedin',
    popupName: 'linkedin-oauth',
    provider: 'linkedin',
    providerLabel: 'LinkedIn',
    scope: 'openid profile email',
    responseType: 'code',
    pkce: true,
    mapResult: ({ code, codeVerifier, redirectUri }) => ({
      code,
      codeVerifier: codeVerifier!,
      redirectUri,
    }),
  })
}
