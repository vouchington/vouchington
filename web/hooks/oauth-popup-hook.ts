'use client'

import { useRef } from 'react'
import { runPopupOAuthLogin, type PopupOAuthLoginConfig } from '@vouchington/utils/oauth-popup'
import type { AuthState } from './oauth-types'

export function usePopupOAuthAuth<T>(config: PopupOAuthLoginConfig<T>): AuthState<T> {
  const isAvailable = Boolean(config.clientId)
  const loginInProgressRef = useRef(false)

  async function login(): Promise<T> {
    if (loginInProgressRef.current) throw new Error('login already in progress')
    loginInProgressRef.current = true
    try {
      return await runPopupOAuthLogin(config)
    } finally {
      loginInProgressRef.current = false
    }
  }

  return { isAvailable, isLoaded: isAvailable, login }
}
