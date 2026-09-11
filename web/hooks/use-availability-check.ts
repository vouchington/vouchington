'use client'

import { useRef, useState, useCallback } from 'react'
import {
  checkAvailability,
  type AvailabilityKind,
  type AvailabilityConflict,
} from '@/lib/api/client/availability'

export type AvailabilityStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error'

export interface AvailabilityState {
  status: AvailabilityStatus
  conflict: AvailabilityConflict | null
}

export function useAvailabilityCheck(kind: AvailabilityKind): {
  state: AvailabilityState
  onBlur: (value: string) => void
  reset: () => void
} {
  const [state, setState] = useState<AvailabilityState>({ status: 'idle', conflict: null })
  const abortRef = useRef<AbortController | null>(null)

  // useCallback with [] keeps onBlur stable for ref={fn} callback ref semantics.
  // The React Compiler memoizes everything else; useCallback here is for stable identity
  // across renders when passed as a prop to imperative APIs that track identity.
  const onBlur = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) {
        setState({ status: 'idle', conflict: null })
        return
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setState({ status: 'checking', conflict: null })

      checkAvailability(kind, trimmed, controller.signal)
        .then(result => {
          if (controller.signal.aborted) return
          setState({
            status: result.available ? 'available' : 'taken',
            conflict: result.conflict,
          })
        })
        .catch(error => {
          if (controller.signal.aborted) return
          if (
            typeof error === 'object' &&
            error !== null &&
            (error as { name?: unknown }).name === 'AbortError'
          )
            return
          setState({ status: 'error', conflict: null })
        })
    },
    [kind],
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setState({ status: 'idle', conflict: null })
  }, [])

  return { state, onBlur, reset }
}
