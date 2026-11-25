'use client'

import { useCallback, useEffect, useState } from 'react'
import { getRetryAfterSeconds } from '@vouchington/api-client'

/** Seconds the server asks clients to wait before another email code, or 0 when absent. */
export function readResendAfterSeconds(response: unknown): number {
  if (typeof response !== 'object' || response === null) return 0
  const value = 'resend_after_seconds' in response ? response.resend_after_seconds : undefined
  return typeof value === 'number' && value > 0 ? Math.ceil(value) : 0
}

/**
 * Counts down the server-provided wait before an email code can be requested again. The server
 * enforces the interval; this only keeps the resend control disabled until it ends.
 */
export function useResendCooldown() {
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = setTimeout(() => setSecondsLeft(current => current - 1), 1000)
    return () => clearTimeout(timer)
  }, [secondsLeft])

  const startFromResponse = useCallback((response: unknown) => {
    setSecondsLeft(readResendAfterSeconds(response))
  }, [])
  const startFromError = useCallback((error: unknown) => {
    const seconds = getRetryAfterSeconds(error)
    if (seconds > 0) setSecondsLeft(seconds)
  }, [])

  return { secondsLeft, startFromError, startFromResponse }
}
