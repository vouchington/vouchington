'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLoadScript } from '@vouchington/script-loader'
import {
  TURNSTILE_SCRIPT_SRC,
  type TurnstileApi,
  type TurnstileRenderParameters,
} from '@vouchington/script-loader/turnstile'
import { toTurnstileAction } from '@ts-shared/utils/turnstile-action'

type TurnstileActionRenderParameters = TurnstileRenderParameters & {
  action: string
  appearance?: 'always' | 'execute' | 'interaction-only'
}

interface UseTurnstileActionOptions {
  actionTag: string
  appearance?: TurnstileActionRenderParameters['appearance']
  enabled?: boolean
  onError?: () => void
  onExpire?: () => void
  onSuccess: (token: string) => void
  siteKey: string
}

interface UseTurnstileActionReturn {
  isError: boolean
  ref: (node: HTMLDivElement | null) => void
  reset: () => void
}

export function useTurnstileAction({
  actionTag,
  appearance,
  enabled = true,
  onError,
  onExpire,
  onSuccess,
  siteKey,
}: UseTurnstileActionOptions): UseTurnstileActionReturn {
  const { isLoaded, isError } = useLoadScript(enabled ? TURNSTILE_SCRIPT_SRC : '')
  const widgetIdRef = useRef<string | null>(null)
  const callbacksRef = useRef({ onError, onExpire, onSuccess })
  const [container, setContainer] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    callbacksRef.current = { onError, onExpire, onSuccess }
  }, [onError, onExpire, onSuccess])

  const ref = useCallback((node: HTMLDivElement | null) => setContainer(node), [])

  useEffect(() => {
    if (isError) callbacksRef.current.onError?.()
  }, [isError])

  useEffect(() => {
    const turnstile: TurnstileApi | undefined = window.turnstile
    if (!isLoaded || !container || !turnstile) return
    const options: TurnstileActionRenderParameters = {
      sitekey: siteKey,
      action: toTurnstileAction(actionTag),
      ...(appearance ? { appearance } : {}),
      callback: token => callbacksRef.current.onSuccess(token),
      'expired-callback': () => callbacksRef.current.onExpire?.(),
      'error-callback': () => callbacksRef.current.onError?.(),
    }
    const widgetId = turnstile.render(container, options)
    if (widgetId === undefined) {
      callbacksRef.current.onError?.()
      return
    }
    widgetIdRef.current = widgetId
    return () => {
      widgetIdRef.current = null
      window.turnstile?.remove(widgetId)
    }
  }, [actionTag, appearance, container, isLoaded, siteKey])

  const reset = useCallback(() => {
    const widgetId = widgetIdRef.current
    if (!widgetId) return
    window.turnstile?.reset(widgetId)
  }, [])

  return { ref, reset, isError }
}
