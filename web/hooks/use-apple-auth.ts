'use client'

import { useRuntimePublicConfig } from '@/lib/runtime-public-config-context'
import { useAppleOAuthAuth } from './oauth-apple-hook'

const APPLE_SCRIPT_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js'

export function useAppleAuth() {
  const { appleClientId } = useRuntimePublicConfig()
  return useAppleOAuthAuth({
    clientId: appleClientId ?? '',
    scriptSrc: APPLE_SCRIPT_SRC,
    callbackPath: '/auth/callback/apple',
  })
}
