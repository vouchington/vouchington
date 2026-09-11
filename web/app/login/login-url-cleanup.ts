/* eslint-disable react-you-might-not-need-an-effect/no-event-handler */
'use client'

import { useEffect } from 'react'

const LOGIN_STATE_QUERY_PARAMS = ['emailAddress', 'otp', 'login_attempt_id'] as const

interface LoginUrlCleanupProps {
  enabled: boolean
}

export function LoginUrlCleanup({ enabled }: LoginUrlCleanupProps) {
  // oxlint-disable-next-line react-doctor/no-effect-event-handler -- URL cleanup on mount is a side effect, not an event handler
  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return

    const { href } = window.location
    if (!LOGIN_STATE_QUERY_PARAMS.some(param => href.includes(`${param}=`))) return

    try {
      const url = new URL(href)
      for (const param of LOGIN_STATE_QUERY_PARAMS) url.searchParams.delete(param)
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    } catch {
      window.history.replaceState(null, '', '/login')
    }
  }, [enabled])

  return null
}
