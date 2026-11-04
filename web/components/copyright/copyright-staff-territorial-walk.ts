'use client'

import { useEffect } from 'react'

type WalkableList = {
  hasNextPage: boolean
  loadingMore: boolean
  fetchError: unknown
  loadMore: () => Promise<unknown>
}

/**
 * Loads every remaining page of a list once `walking` is true. Each arriving page triggers the
 * next, and a failed page pauses the walk until the error clears, so a retry never starts a second
 * load beside the running one.
 */
export function useWalkToEnd(
  { hasNextPage, loadingMore, fetchError, loadMore }: WalkableList,
  walking: boolean,
): void {
  useEffect(() => {
    // oxlint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- each arriving page triggers the next, so the walk continues from loaded state, not from the click alone
    if (walking && hasNextPage && !loadingMore && !fetchError) void loadMore()
  }, [walking, hasNextPage, loadingMore, fetchError, loadMore])
}
