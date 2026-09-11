'use client'

import { useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { buildLoginHref } from '@/lib/auth/login-url'

const HISTORY_STATE_CHANGE_EVENT = 'voucha:history-state-change'
let historyPatch:
  | {
      pushState: History['pushState']
      replaceState: History['replaceState']
    }
  | undefined

export function useLoginHref(intent?: string): string {
  const pathname = usePathname()
  const query = useLocationSearch()

  return buildLoginHref({ intent, next: query ? `${pathname}?${query}` : pathname })
}

function useLocationSearch(): string {
  return useSyncExternalStore(subscribeToLocationSearch, getLocationSearch, getServerSnapshot)
}

function subscribeToLocationSearch(onStoreChange: () => void): () => void {
  patchHistoryState()
  window.addEventListener('popstate', onStoreChange)
  window.addEventListener(HISTORY_STATE_CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('popstate', onStoreChange)
    window.removeEventListener(HISTORY_STATE_CHANGE_EVENT, onStoreChange)
  }
}

function getLocationSearch(): string {
  return window.location.search.slice(1)
}

function getServerSnapshot(): string {
  return ''
}

function patchHistoryState() {
  if (historyPatch) return

  const pushState = window.history.pushState
  const replaceState = window.history.replaceState
  historyPatch = { pushState, replaceState }
  window.history.pushState = function patchedPushState(...args) {
    const result = pushState.apply(this, args)
    queueMicrotask(dispatchHistoryStateChange)
    return result
  }
  window.history.replaceState = function patchedReplaceState(...args) {
    const result = replaceState.apply(this, args)
    queueMicrotask(dispatchHistoryStateChange)
    return result
  }
}

function dispatchHistoryStateChange() {
  window.dispatchEvent(new Event(HISTORY_STATE_CHANGE_EVENT))
}
