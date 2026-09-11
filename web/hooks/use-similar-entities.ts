'use client'

import { useEffect, useEffectEvent, useReducer } from 'react'
import onError from '@/lib/on-error'

export interface SimilarEntitiesResult<T> {
  data: T | null
  isLoading: boolean
}

interface UseSimilarEntitiesOptions<T> {
  query: string
  minLength?: number
  debounceMs?: number
  fetcher: (q: string, signal: AbortSignal) => Promise<T>
  enabled?: boolean
}

/**
 * Debounced, abortable hook for fetching similarity-ranked entities.
 * Used by admin duplicate-detection panels on topic create and topic
 * recommendation review surfaces.
 *
 * `fetcher` is kept in a ref so its identity does not drive effect re-runs.
 * The React Compiler memoizes inline arrow-function fetchers in production;
 * test environments run without the compiler, so the ref prevents infinite
 * re-runs when the inline function recreates each render.
 *
 * Errors are routed through @/lib/on-error (search-form rule: no success toast).
 */
export function useSimilarEntities<T>({
  query,
  minLength = 3,
  debounceMs = 400,
  fetcher,
  enabled = true,
}: UseSimilarEntitiesOptions<T>): SimilarEntitiesResult<T> {
  const [result, setResult] = useReducer(
    (
      _: {
        query: string
        data: T | null
        isLoading: boolean
      },
      next: { query: string; data: T | null; isLoading: boolean },
    ) => next,
    {
      query: '',
      data: null,
      isLoading: false,
    },
  )
  const runFetcher = useEffectEvent(fetcher)
  const trimmed = query.trim()
  const canFetch = enabled && trimmed.length >= minLength

  useEffect(() => {
    if (!canFetch) return
    const controller = new AbortController()

    const timeoutId = setTimeout(() => {
      setResult({ query: trimmed, data: null, isLoading: true })
      runFetcher(trimmed, controller.signal)
        .then(result => {
          if (!controller.signal.aborted) {
            setResult({ query: trimmed, data: result, isLoading: false })
          }
        })
        .catch(error => {
          if (!controller.signal.aborted) {
            setResult({ query: trimmed, data: null, isLoading: false })
            onError(error, { fallback: 'Failed to load similar items', skipSentry: true })
          }
        })
    }, debounceMs)

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [trimmed, canFetch, debounceMs])

  return {
    data: canFetch && result.query === trimmed ? result.data : null,
    isLoading: canFetch && (result.query !== trimmed || result.isLoading),
  }
}
