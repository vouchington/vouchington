'use client'

import { useState } from 'react'
import { useTurnstileAction } from './use-turnstile-action'
import {
  TURNSTILE_ALWAYS_APPROVE_TOKEN,
  useTurnstileAlwaysApprove,
} from './use-turnstile-always-approve'
import { getTurnstileSiteKey } from '@/lib/turnstile-config'
import type { RuntimePublicConfig } from '@/lib/runtime-public-config'

export function useLoginTurnstile(runtimePublicConfig: RuntimePublicConfig) {
  const alwaysApprove = useTurnstileAlwaysApprove()
  const [token, setToken] = useState<string | null>(null)
  const turnstile = useTurnstileAction({
    actionTag: 'auth.email-address-tokens',
    siteKey: getTurnstileSiteKey(runtimePublicConfig),
    enabled: !alwaysApprove,
    onSuccess: setToken,
    onExpire: () => setToken(null),
    onError: () => setToken(null),
  })

  function reset() {
    turnstile.reset()
    if (!alwaysApprove) setToken(null)
  }

  return {
    alwaysApprove,
    ref: turnstile.ref,
    reset,
    token: alwaysApprove ? TURNSTILE_ALWAYS_APPROVE_TOKEN : token,
  }
}
