'use client'

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { OAuthCancelledError } from '@/lib/auth/oauth-error'
import type { AuthState } from './oauth-types'
import { useLoadScript } from './use-load-script'

export interface GoogleOAuthConfig {
  clientId: string
  scriptSrc: string
}

export function useGoogleOAuthAuth(config: GoogleOAuthConfig): AuthState<string> {
  const { clientId } = config
  const isAvailable = Boolean(clientId)
  const hasGoogleApi = useGoogleLibraryLoad(isAvailable)
  const { isLoaded } = useLoadScript(isAvailable ? config.scriptSrc : '')
  const callbackRef = useRef<((credential: string) => void) | null>(null)
  const rejectRef = useRef<((err: Error) => void) | null>(null)

  useEffect(() => {
    return () => {
      callbackRef.current = null
      rejectRef.current = null
    }
  }, [])

  function login(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!window.google?.accounts?.id) {
        reject(new Error('Google Identity Services not loaded'))
        return
      }
      if (callbackRef.current) {
        reject(new Error('login already in progress'))
        return
      }

      callbackRef.current = resolve
      rejectRef.current = reject
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: response => {
          if (response.credential) {
            callbackRef.current?.(response.credential)
          } else {
            rejectRef.current?.(new OAuthCancelledError('Google'))
          }
          callbackRef.current = null
          rejectRef.current = null
        },
      })
      window.google.accounts.id.prompt(notification => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          callbackRef.current = null
          rejectRef.current = null
          reject(new OAuthCancelledError('Google', 'Google login not displayed or skipped'))
        }
      })
    })
  }

  return { isAvailable, isLoaded: isLoaded && hasGoogleApi, login }
}

const googleLibraryLoadCallbacks = new Set<() => void>()
let googleLibraryLoadCallbackInstalled = false

function useGoogleLibraryLoad(enabled: boolean): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeToGoogleLibraryLoad(enabled, onStoreChange),
    [enabled],
  )
  const getSnapshot = useCallback(() => enabled && hasGoogleIdentityServices(), [enabled])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

function subscribeToGoogleLibraryLoad(enabled: boolean, onStoreChange: () => void): () => void {
  if (!enabled) return () => undefined

  installGoogleLibraryLoadCallback()
  googleLibraryLoadCallbacks.add(onStoreChange)

  if (hasGoogleIdentityServices()) {
    queueMicrotask(onStoreChange)
  }

  return () => {
    googleLibraryLoadCallbacks.delete(onStoreChange)
  }
}

function installGoogleLibraryLoadCallback() {
  if (googleLibraryLoadCallbackInstalled) return

  googleLibraryLoadCallbackInstalled = true
  const previousCallback = window.onGoogleLibraryLoad
  window.onGoogleLibraryLoad = () => {
    previousCallback?.()
    for (const callback of googleLibraryLoadCallbacks) {
      callback()
    }
  }
}

function hasGoogleIdentityServices(): boolean {
  return Boolean(window.google?.accounts?.id)
}

declare global {
  interface Window {
    onGoogleLibraryLoad?: () => void
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential?: string }) => void
          }) => void
          prompt: (
            callback: (notification: {
              isNotDisplayed: () => boolean
              isSkippedMoment: () => boolean
            }) => void,
          ) => void
        }
      }
    }
  }
}
