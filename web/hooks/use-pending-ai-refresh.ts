'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const MAX_PENDING_REFRESH_MS = 60_000

/** Refresh a visible queue while a saved AI result is still pending. */
export function usePendingAiRefresh(
  pending: boolean,
  refresh: () => void | Promise<void>,
  pendingKey: string | null = null,
  onTimeout?: (expiredKeys: readonly string[]) => void,
): boolean {
  const latestRefresh = useRef(refresh)
  const latestTimeout = useRef(onTimeout)
  const deadlines = useRef(new Map<string, number>())
  const expired = useRef(new Set<string>())
  const [expiredVisible, setExpiredVisible] = useState<ReadonlySet<string>>(() => new Set())
  const pendingKeys = useMemo(
    () => (pending ? (pendingKey ? pendingKey.split('|') : ['pending']) : []),
    [pending, pendingKey],
  )
  useEffect(() => {
    latestRefresh.current = refresh
    latestTimeout.current = onTimeout
  }, [refresh, onTimeout])
  useEffect(() => {
    const visible = new Set(pendingKeys)
    let active = true
    for (const key of deadlines.current.keys()) {
      if (!visible.has(key)) deadlines.current.delete(key)
    }
    for (const key of expired.current) {
      if (!visible.has(key)) expired.current.delete(key)
    }
    queueMicrotask(() => {
      if (!active) return
      setExpiredVisible(current => {
        const next = new Set([...current].filter(key => visible.has(key)))
        return next.size === current.size ? current : next
      })
    })
    for (const key of pendingKeys) {
      if (!deadlines.current.has(key))
        deadlines.current.set(key, Date.now() + MAX_PENDING_REFRESH_MS)
    }
    if (pendingKeys.length === 0)
      return () => {
        active = false
      }
    let inFlight = false
    const interval = window.setInterval(() => {
      const now = Date.now()
      const newlyExpired = pendingKeys.filter(
        key => now >= deadlines.current.get(key)! && !expired.current.has(key),
      )
      if (newlyExpired.length > 0) {
        for (const key of newlyExpired) expired.current.add(key)
        setExpiredVisible(new Set(expired.current))
        latestTimeout.current?.(newlyExpired)
      }
      if (pendingKeys.every(key => now >= deadlines.current.get(key)!)) {
        window.clearInterval(interval)
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
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [pendingKeys])
  return pendingKeys.some(key => expiredVisible.has(key))
}
