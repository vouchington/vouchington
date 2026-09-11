'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useLoadScript } from './use-load-script'
import { useRuntimePublicConfig } from '@/lib/runtime-public-config-context'

const FACEBOOK_SCRIPT_SRC = 'https://connect.facebook.net/en_US/sdk.js'
const IS_DEV = process.env.NODE_ENV === 'development'
let hasInitializedFacebookSdk = false
let isFacebookSdkReady = false
const facebookSdkSubscribers = new Set<() => void>()

interface UseFacebookSDK {
  isAvailable: boolean
  isLoaded: boolean
  login: () => Promise<string>
}

function subscribeToFacebookSdkReady(notify: () => void) {
  facebookSdkSubscribers.add(notify)
  return () => facebookSdkSubscribers.delete(notify)
}

function getFacebookSdkReadySnapshot() {
  return isFacebookSdkReady
}

function markFacebookSdkReady() {
  if (isFacebookSdkReady) return
  isFacebookSdkReady = true
  for (const notify of facebookSdkSubscribers) notify()
}

export function useFacebookSDK(): UseFacebookSDK {
  const { facebookAppId = '' } = useRuntimePublicConfig()
  const isAvailable = Boolean(facebookAppId)
  const { isLoaded: scriptReady, isError: scriptError } = useLoadScript(
    isAvailable ? FACEBOOK_SCRIPT_SRC : '',
  )
  const hasFacebookGlobal = typeof window !== 'undefined' && !!window.FB
  const isSdkReady = useSyncExternalStore(
    subscribeToFacebookSdkReady,
    getFacebookSdkReadySnapshot,
    () => false,
  )

  useEffect(() => {
    if (!scriptReady || !window.FB) return

    if (!hasInitializedFacebookSdk) {
      window.FB.init({
        appId: facebookAppId,
        version: 'v25.0',
        cookie: false,
        xfbml: false,
      })
      hasInitializedFacebookSdk = true
    }
    markFacebookSdkReady()
  }, [facebookAppId, scriptReady])

  function login(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!window.FB || !isFacebookSdkReady) {
        reject(new Error('Facebook SDK is not ready'))
        return
      }
      try {
        window.FB.login(
          response => {
            if (IS_DEV) {
              console.log('[FB.login] status:', response.status)
            }
            if (response.status === 'connected' && response.authResponse) {
              resolve(response.authResponse.accessToken)
            } else if (response.status === 'not_authorized') {
              reject(new Error('Facebook permissions were not granted. Please try again.'))
            } else {
              reject(
                new Error(
                  `Facebook login could not be completed (status: ${response.status ?? 'none'}). Please try again.`,
                ),
              )
            }
          },
          { scope: 'email' },
        )
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Facebook login failed'))
      }
    })
  }

  return {
    isAvailable,
    isLoaded: scriptReady && !scriptError && hasFacebookGlobal && isSdkReady,
    login,
  }
}

export function resetFacebookSdkStateForTests() {
  hasInitializedFacebookSdk = false
  isFacebookSdkReady = false
  facebookSdkSubscribers.clear()
}
