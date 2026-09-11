'use client'

import { useState } from 'react'
import { useTurnstile } from './use-turnstile'
import {
  TURNSTILE_ALWAYS_APPROVE_TOKEN,
  useTurnstileAlwaysApprove,
} from './use-turnstile-always-approve'
import { getTurnstileSiteKey } from '@/lib/turnstile-config'
import { useRuntimePublicConfig } from '@/lib/runtime-public-config-context'

export interface UseTurnstileTokenReturn {
  /** The current verification token, or `null` until the challenge resolves. */
  token: string | null
  /** Resets the widget and clears the consumed token (call after each submit). */
  reset: () => void
  /** Callback ref for the widget container `<div>`. */
  containerRef: (node: HTMLDivElement | null) => void
  /** True when the Turnstile script failed to load or the challenge errored. */
  isError: boolean
  /** True when staging Turnstile always-approve is active. */
  alwaysApprove: boolean
}

/**
 * Wraps {@link useTurnstile} with the token-state + reset bookkeeping that every
 * content-creation form needs: it owns the token, clears it on expiry/error, and
 * exposes a single `reset()` that both resets the widget and clears the token so
 * the submit button re-disables until a fresh challenge completes.
 *
 * Mirrors the inline wiring in the login form (`web/components/auth/login-form.tsx`)
 * so create forms (post, comment, topic recommendation, community, report) don't
 * each re-implement it. Pair with {@link TurnstileField} for the container markup.
 */
export function useTurnstileToken(): UseTurnstileTokenReturn {
  const runtimePublicConfig = useRuntimePublicConfig()
  const alwaysApprove = useTurnstileAlwaysApprove()
  const [token, setToken] = useState<string | null>(null)
  const turnstile = useTurnstile({
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
    token: alwaysApprove ? TURNSTILE_ALWAYS_APPROVE_TOKEN : token,
    reset,
    containerRef: turnstile.ref,
    isError: alwaysApprove ? false : turnstile.isError,
    alwaysApprove,
  }
}
