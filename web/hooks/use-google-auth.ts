'use client'

import { useRuntimePublicConfig } from '@/lib/runtime-public-config-context'
import { useGoogleOAuthAuth } from './oauth-google-hook'

const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

export function useGoogleAuth() {
  const { googleClientId } = useRuntimePublicConfig()
  return useGoogleOAuthAuth({
    clientId: googleClientId ?? '',
    scriptSrc: GOOGLE_SCRIPT_SRC,
  })
}
