'use client'

import { useEffect } from 'react'

/** Refresh a visible queue while a saved AI result is still pending. */
export function usePendingAiRefresh(pending: boolean, refresh: () => void | Promise<void>): void {
  useEffect(() => {
    if (!pending) return
    let inFlight = false
    const interval = window.setInterval(() => {
      if (inFlight) return
      inFlight = true
      void Promise.resolve()
        .then(refresh)
        .catch(err => {
          console.error('Could not refresh pending AI result', err)
        })
        .finally(() => {
          inFlight = false
        })
    }, 5000)
    return () => window.clearInterval(interval)
  }, [pending, refresh])
}
