'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const MAX_PENDING_REFRESH_MS = 60_000

/** Refresh a visible queue while a saved AI result is still pending. */
export function usePendingAiRefresh(
  pending: boolean,
  refresh: () => void | Promise<void>,
): boolean {
  const latestRefresh = useRef(refresh)
  const pendingToken = useMemo(() => (pending ? Symbol('pending-ai-refresh') : null), [pending])
  const [timedOutToken, setTimedOutToken] = useState<symbol | null>(null)
  useEffect(() => {
    latestRefresh.current = refresh
  }, [refresh])
  useEffect(() => {
    if (!pending) return
    let inFlight = false
    const deadline = Date.now() + MAX_PENDING_REFRESH_MS
    const interval = window.setInterval(() => {
      if (Date.now() >= deadline) {
        window.clearInterval(interval)
        setTimedOutToken(pendingToken)
        return
      }
      if (inFlight) return
      inFlight = true
      void Promise.resolve()
        .then(() => latestRefresh.current())
        .catch(err => {
          console.error('Could not refresh pending AI result', err)
        })
        .finally(() => {
          inFlight = false
        })
    }, 5000)
    return () => window.clearInterval(interval)
  }, [pending, pendingToken])
  return pending && timedOutToken === pendingToken
}
