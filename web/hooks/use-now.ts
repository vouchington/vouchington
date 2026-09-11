'use client'

import { useSyncExternalStore } from 'react'

// Module-level singleton so all TimeAgo instances share one 30-second interval.
// The timer starts on first subscriber mount and stops when the last unmounts.
const subscribers = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null
let currentNow = Date.now()

function refreshNow() {
  const nextNow = Date.now()
  if (nextNow === currentNow) return false
  currentNow = nextNow
  return true
}

function tick() {
  refreshNow()
  for (const notify of subscribers) notify()
}

function getSnapshot() {
  return currentNow
}

function getServerSnapshot() {
  return null
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify)
  refreshNow()
  if (!timer) {
    timer = setInterval(tick, 30_000)
  }
  return () => {
    subscribers.delete(notify)
    if (subscribers.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

/**
 * Returns the current timestamp in ms, or `null` on the initial server render.
 *
 * All hook instances share a single `setInterval`, so a page with N `<TimeAgo>`
 * components triggers one timer tick per 30s (not N), while each component still
 * gets its own React state update.
 */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
