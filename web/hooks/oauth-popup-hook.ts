'use client'

import { useRef } from 'react'
import { openOAuthPopup } from '@/lib/auth/open-oauth-popup'
import { generateCodeChallenge, generateCodeVerifier, generateState } from '@/lib/auth/pkce'
import type { AuthState } from './oauth-types'

export interface PopupOAuthConfig<T> {
  clientId: string
  authUrl: string | (() => string)
  callbackPath: string
  popupName: string
  provider: string
  providerLabel: string
  scope: string
  responseType?: string
  responseMode?: string
  pkce?: boolean
  mapResult: (result: { code: string; codeVerifier?: string; redirectUri: string }) => T
}

export function usePopupOAuthAuth<T>(config: PopupOAuthConfig<T>): AuthState<T> {
  const { clientId } = config
  const isAvailable = Boolean(clientId)
  const loginInProgressRef = useRef(false)

  async function login(): Promise<T> {
    if (loginInProgressRef.current) throw new Error('login already in progress')
    loginInProgressRef.current = true
    try {
      const state = generateState()
      const redirectUri = `${window.location.origin}${config.callbackPath}`
      const authUrl = new URL(
        typeof config.authUrl === 'function' ? config.authUrl() : config.authUrl,
      )
      const codeVerifier = config.pkce ? generateCodeVerifier() : undefined
      const codeChallenge = codeVerifier ? await generateCodeChallenge(codeVerifier) : undefined

      if (config.responseType) authUrl.searchParams.set('response_type', config.responseType)
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('scope', config.scope)
      authUrl.searchParams.set('state', state)
      if (config.responseMode) authUrl.searchParams.set('response_mode', config.responseMode)
      if (codeChallenge) {
        authUrl.searchParams.set('code_challenge', codeChallenge)
        authUrl.searchParams.set('code_challenge_method', 'S256')
      }

      const { code } = await openOAuthPopup({
        authUrl,
        popupName: config.popupName,
        provider: config.provider,
        providerLabel: config.providerLabel,
        state,
      })

      return config.mapResult({ code, codeVerifier, redirectUri })
    } finally {
      loginInProgressRef.current = false
    }
  }

  return { isAvailable, isLoaded: isAvailable, login }
}
