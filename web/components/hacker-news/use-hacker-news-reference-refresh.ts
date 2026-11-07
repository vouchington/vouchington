'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getPaginatedPage } from '@/lib/api/client'
import type { PaginatedListParams } from '@/hooks/use-paginated-list'
import {
  useHackerNewsConfig,
  useHackerNewsReferenceRefreshGeneration,
} from './hacker-news-config-context'

/** Refresh an opted-in paginated list after the server acknowledges reference visibility. */
export function useHackerNewsReferenceRefresh<T>(
  refreshLoadedPages: (fetchFirstPage: () => Promise<T>) => Promise<void>,
  endpoint: string,
  params: PaginatedListParams,
  fetchError: Error | null,
  resetKey: symbol,
) {
  const generation = useHackerNewsReferenceRefreshGeneration()
  const { references_visible: referencesVisible } = useHackerNewsConfig()
  const requestedGeneration = useRef(0)
  const pendingGeneration = useRef<number | null>(null)
  const scope = useRef(resetKey)
  const currentAttempt = useRef<object | null>(null)
  const inFlight = useRef(false)
  const [attemptRevision, setAttemptRevision] = useState(0)
  const refreshRef = useRef(refreshLoadedPages)
  useLayoutEffect(() => {
    refreshRef.current = refreshLoadedPages
  }, [refreshLoadedPages])

  useLayoutEffect(() => {
    if (scope.current === resetKey) return
    scope.current = resetKey
    currentAttempt.current = null
    inFlight.current = false
    pendingGeneration.current = null
    requestedGeneration.current = generation
  }, [generation, resetKey])

  const runRefresh = useCallback(async () => {
    if (!endpoint || generation === 0 || !referencesVisible || scope.current !== resetKey) return
    const attempt = {}
    currentAttempt.current = attempt
    pendingGeneration.current = generation
    inFlight.current = true
    try {
      await refreshRef.current(() => getPaginatedPage<T>(endpoint, params))
    } finally {
      if (currentAttempt.current === attempt && scope.current === resetKey) {
        inFlight.current = false
        setAttemptRevision(previous => previous + 1)
      }
    }
  }, [endpoint, generation, params, referencesVisible, resetKey])

  /* oxlint-disable react-you-might-not-need-an-effect/no-event-handler -- synchronize retained network pages with an external server acknowledgement and its asynchronous result */
  useEffect(() => {
    if (
      !endpoint ||
      !referencesVisible ||
      generation === 0 ||
      generation === requestedGeneration.current
    )
      return
    requestedGeneration.current = generation
    pendingGeneration.current = generation
    void runRefresh()
  }, [endpoint, generation, params, referencesVisible, runRefresh])

  useEffect(() => {
    if (pendingGeneration.current === generation && !inFlight.current && !fetchError) {
      pendingGeneration.current = null
    }
  }, [attemptRevision, fetchError, generation])

  /* oxlint-enable react-you-might-not-need-an-effect/no-event-handler */

  const retry = useCallback(() => {
    if (pendingGeneration.current !== generation || !referencesVisible) return Promise.resolve()
    return runRefresh()
  }, [generation, referencesVisible, runRefresh])

  const handleLoadMore = useCallback(
    (loadMore: () => Promise<void | boolean>) => () =>
      pendingGeneration.current === generation && referencesVisible && !inFlight.current
        ? retry()
        : loadMore(),
    [generation, referencesVisible, retry],
  )

  return { retry, handleLoadMore }
}
