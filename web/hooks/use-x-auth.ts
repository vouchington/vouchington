'use client'

import { useRuntimePublicConfig } from '@/lib/runtime-public-config-context'
import { usePopupOAuthAuth } from './oauth-popup-hook'

export function useXAuth() {
  const { xClientId } = useRuntimePublicConfig()
  return usePopupOAuthAuth({
    clientId: xClientId ?? '',
    authUrl: 'https://x.com/i/oauth2/authorize',
    callbackPath: '/auth/callback/x',
    popupName: 'x-oauth',
    provider: 'x',
    providerLabel: 'X',
    scope: 'tweet.read users.read',
    responseType: 'code',
    pkce: true,
    mapResult: ({ code, codeVerifier, redirectUri }) => ({
      code,
      codeVerifier: codeVerifier!,
      redirectUri,
    }),
  })
}
