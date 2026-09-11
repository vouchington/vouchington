'use client'

import { useCallback, useSyncExternalStore } from 'react'

type ScriptStatus = 'idle' | 'loading' | 'ready' | 'error'

const scriptStatuses = new Map<string, ScriptStatus>()
const scriptCallbacks = new Map<string, Set<() => void>>()
const scriptErrorTimes = new Map<string, number>() // Track when error occurred for retry TTL

function notifyCallbacks(src: string, status: ScriptStatus) {
  scriptStatuses.set(src, status)
  if (status === 'error') {
    scriptErrorTimes.set(src, Date.now())
  }
  scriptCallbacks.get(src)?.forEach(cb => cb())
}

interface UseLoadScriptResult {
  isLoaded: boolean
  isError: boolean
}

interface UseLoadScriptOptions {
  nonce?: string
  integrity?: string
  crossOrigin?: HTMLScriptElement['crossOrigin']
}

function getScriptStatus(src: string): ScriptStatus {
  if (!src) return 'idle'
  return scriptStatuses.get(src) ?? 'idle'
}

function ensureScript(src: string, options: UseLoadScriptOptions) {
  const currentStatus = scriptStatuses.get(src)
  const errorTime = scriptErrorTimes.get(src)
  const errorTTL = 30 * 1000 // Retry after 30 seconds

  // If error occurred but TTL expired, reset to idle to retry
  if (currentStatus === 'error' && errorTime && Date.now() - errorTime > errorTTL) {
    scriptStatuses.delete(src)
    scriptErrorTimes.delete(src)
  }

  const updatedStatus = scriptStatuses.get(src)
  if (updatedStatus === 'ready' || updatedStatus === 'error' || updatedStatus === 'loading') return

  scriptStatuses.set(src, 'loading')

  const script = document.createElement('script')
  script.src = src
  script.async = true
  if (options.nonce) {
    script.nonce = options.nonce
  }
  if (options.integrity) {
    script.integrity = options.integrity
  }
  if (options.crossOrigin !== undefined) {
    script.crossOrigin = options.crossOrigin
  }
  script.onload = () => notifyCallbacks(src, 'ready')
  script.onerror = () => notifyCallbacks(src, 'error')
  document.head.append(script)
}

function subscribeToScriptStatus(
  src: string,
  options: UseLoadScriptOptions,
  onStoreChange: () => void,
): () => void {
  if (!src) return () => undefined
  if (!scriptCallbacks.has(src)) {
    scriptCallbacks.set(src, new Set())
  }
  scriptCallbacks.get(src)!.add(onStoreChange)
  ensureScript(src, options)
  return () => {
    scriptCallbacks.get(src)?.delete(onStoreChange)
  }
}

/**
 * Lazily loads a third-party script tag once, shared across all hook instances.
 * Only call this hook when the script is actually needed (e.g. when the user is
 * not already logged in, or when a button that needs the SDK is rendered).
 *
 * Pass an empty string to skip loading (e.g. when the feature is not available).
 *
 * @returns `{ isLoaded, isError }` — isLoaded is true once the script loaded successfully,
 *   isError is true if the script failed to load
 */
export function useLoadScript(
  src: string,
  options: UseLoadScriptOptions = {},
): UseLoadScriptResult {
  const { nonce, integrity, crossOrigin } = options
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      subscribeToScriptStatus(src, { nonce, integrity, crossOrigin }, onStoreChange),
    [crossOrigin, integrity, nonce, src],
  )
  const status = useSyncExternalStore(
    subscribe,
    () => getScriptStatus(src),
    () => 'idle',
  )

  return { isLoaded: status === 'ready', isError: status === 'error' }
}
