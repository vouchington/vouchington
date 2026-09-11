'use client'

import { useRuntimePublicConfig } from '@/lib/runtime-public-config-context'
import { usePopupOAuthAuth } from './oauth-popup-hook'

export function useGithubAuth() {
  const { githubClientId } = useRuntimePublicConfig()
  return usePopupOAuthAuth({
    clientId: githubClientId ?? '',
    authUrl: 'https://github.com/login/oauth/authorize',
    callbackPath: '/auth/callback/github',
    popupName: 'github-oauth',
    provider: 'github',
    providerLabel: 'GitHub',
    scope: 'read:user user:email',
    mapResult: ({ code, redirectUri }) => ({ code, redirectUri }),
  })
}
