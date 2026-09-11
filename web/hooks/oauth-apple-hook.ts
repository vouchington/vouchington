'use client'

import { useRef } from 'react'
import { OAuthCancelledError } from '@/lib/auth/oauth-error'
import type { AuthState } from './oauth-types'
import { useLoadScript } from './use-load-script'

export interface AppleAuthResult {
  token: string
  nonce: string
  userData?: { name?: string }
}

export interface AppleOAuthConfig {
  clientId: string
  scriptSrc: string
  callbackPath: string
}

export function useAppleOAuthAuth(config: AppleOAuthConfig): AuthState<AppleAuthResult> {
  const { clientId } = config
  const isAvailable = Boolean(clientId)
  const { isLoaded: scriptReady, isError: scriptError } = useLoadScript(
    isAvailable ? config.scriptSrc : '',
  )
  const loginInProgressRef = useRef(false)
  const isLoaded = scriptReady && !scriptError

  async function login(): Promise<AppleAuthResult> {
    if (!window.AppleID?.auth) throw new Error('Apple Sign In not loaded')
    if (loginInProgressRef.current) throw new Error('login already in progress')
    loginInProgressRef.current = true
    try {
      const rawNonce = generateRawNonce()
      const hashedNonce = await sha256Hex(rawNonce)
      window.AppleID.auth.init({
        clientId,
        scope: 'name email',
        redirectURI: `${window.location.origin}${config.callbackPath}`,
        usePopup: true,
        nonce: hashedNonce,
      })

      let response: AppleAuthResponse
      try {
        response = await window.AppleID.auth.signIn()
      } catch {
        throw new OAuthCancelledError('Apple')
      }

      const userName = appleUserName(response)
      return {
        token: response.authorization.id_token,
        nonce: rawNonce,
        userData: userName ? { name: userName } : undefined,
      }
    } finally {
      loginInProgressRef.current = false
    }
  }

  return { isAvailable, isLoaded, login }
}

function generateRawNonce(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return [...array].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(str: string): Promise<string> {
  const data = new TextEncoder().encode(str)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function appleUserName(response: AppleAuthResponse): string | undefined {
  if (!response.user?.name) return undefined
  const { firstName, lastName } = response.user.name
  return [firstName, lastName].filter(Boolean).join(' ') || undefined
}

interface AppleAuthResponse {
  authorization: {
    id_token: string
    code: string
    state?: string
  }
  user?: {
    name?: {
      firstName?: string
      lastName?: string
    }
    email?: string
  }
}

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string
          scope: string
          redirectURI: string
          usePopup: boolean
          nonce?: string
        }) => void
        signIn: () => Promise<AppleAuthResponse>
      }
    }
  }
}
