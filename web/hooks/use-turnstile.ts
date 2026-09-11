'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLoadScript } from './use-load-script'

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface UseTurnstileOptions {
  siteKey: string
  onSuccess: (token: string) => void
  onExpire?: () => void
  onError?: () => void
  enabled?: boolean
}

interface UseTurnstileReturn {
  ref: (node: HTMLDivElement | null) => void
  reset: () => void
  isError: boolean
}

export function useTurnstile({
  siteKey,
  onSuccess,
  onExpire,
  onError,
  enabled = true,
}: UseTurnstileOptions): UseTurnstileReturn {
  const { isLoaded, isError } = useLoadScript(enabled ? TURNSTILE_SCRIPT : '')
  const widgetIdRef = useRef<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [mounted, setMounted] = useState(false)

  // Stable refs for callbacks to avoid re-rendering the widget
  const callbacksRef = useRef({ onSuccess, onExpire, onError })

  useEffect(() => {
    callbacksRef.current = { onSuccess, onExpire, onError }
  }, [onSuccess, onExpire, onError])

  const ref = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node
    setMounted(!!node)
  }, [])

  useEffect(() => {
    if (isError) {
      callbacksRef.current.onError?.()
    }
  }, [isError])

  useEffect(() => {
    if (!isLoaded || !mounted || !containerRef.current || !window.turnstile) return
    if (widgetIdRef.current) return

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token: string) => callbacksRef.current.onSuccess(token),
      'expired-callback': () => callbacksRef.current.onExpire?.(),
      'error-callback': () => callbacksRef.current.onError?.(),
    })

    return () => {
      if (widgetIdRef.current) {
        window.turnstile?.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [isLoaded, mounted, siteKey])

  function reset() {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current)
    }
  }

  return { ref, reset, isError }
}
