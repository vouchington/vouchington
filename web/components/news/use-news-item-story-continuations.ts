'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getStoryMemberPage } from '@/lib/api/client/stories'
import {
  updateStory,
  type FirstStorySelection,
  type StoryState,
} from './news-item-cluster-projection'
import { refreshStoryMemberPages } from './refresh-story-member-pages'

export function useNewsItemStoryContinuations({
  selections,
  key,
  viewerId,
  generation,
}: {
  selections: Map<string, FirstStorySelection>
  key: symbol
  viewerId: string | null
  generation: number
}) {
  const requestScope = useMemo(
    () => ({
      key,
      viewerId,
      generation,
      active: new Set<string>(),
      pendingRefresh: new Map<string, { primaryId: string; pageCount: number }>(),
    }),
    [key, viewerId, generation],
  )
  const requestScopeRef = useRef(requestScope)
  useLayoutEffect(() => {
    requestScopeRef.current = requestScope
  }, [requestScope])
  const [storyState, setStoryState] = useState<StoryState>({ key, viewerId, byStory: {} })
  const currentStoryState =
    storyState.key === key && storyState.viewerId === viewerId
      ? storyState
      : { key, viewerId, byStory: {} }
  if (currentStoryState !== storyState) setStoryState(currentStoryState)
  const latestStoryState = useRef(storyState)
  const latestSelections = useRef(selections)
  useLayoutEffect(() => {
    latestSelections.current = selections
    latestStoryState.current = storyState
  }, [selections, storyState])

  function fetchRefreshedPages(
    storyId: string,
    selection: FirstStorySelection,
    pageCount: number,
    scope: typeof requestScope,
  ) {
    return refreshStoryMemberPages(
      storyId,
      selection,
      pageCount,
      () =>
        requestScopeRef.current === scope &&
        latestSelections.current.get(storyId)?.primaryId === selection.primaryId,
    )
  }

  function patchStory(
    storyId: string,
    selection: FirstStorySelection,
    scope: typeof requestScope,
    patch: Parameters<typeof updateStory>[4],
  ) {
    setStoryState(previous => updateStory(previous, scope, storyId, selection.primaryId, patch))
  }

  function applyRefreshedPages(
    storyId: string,
    selection: FirstStorySelection,
    pages: Awaited<ReturnType<typeof fetchRefreshedPages>>,
    scope: typeof requestScope,
  ) {
    if (!pages) return
    scope.pendingRefresh.delete(storyId)
    patchStory(storyId, selection, scope, { pages, loading: false, error: false })
  }

  function markFailed(storyId: string, selection: FirstStorySelection, scope: typeof requestScope) {
    if (requestScopeRef.current !== scope) return
    patchStory(storyId, selection, scope, { loading: false, error: true })
  }

  useEffect(() => {
    if (generation === 0) return
    const storiesToRefresh = Object.entries(currentStoryState.byStory).filter(
      ([storyId, state]) =>
        selections.get(storyId)?.primaryId === state.primaryId &&
        (state.pages.length > 0 || state.loading),
    )
    let cancelled = false
    void (async () => {
      for (const [storyId] of storiesToRefresh) {
        if (cancelled) return
        if (requestScopeRef.current !== requestScope) return
        if (requestScope.active.has(storyId)) continue
        const selection = selections.get(storyId)
        if (!selection) continue
        // Size from current state: a page may have loaded while earlier stories replayed.
        const state = latestStoryState.current.byStory[storyId]
        if (state?.primaryId !== selection.primaryId) continue
        requestScope.active.add(storyId)
        const pageCount = Math.max(1, state.pages.length)
        requestScope.pendingRefresh.set(storyId, { primaryId: selection.primaryId, pageCount })
        patchStory(storyId, selection, requestScope, { loading: true, error: false })
        try {
          // oxlint-disable-next-line no-await-in-loop -- serialize retained stories to bound refresh concurrency
          const pages = await fetchRefreshedPages(storyId, selection, pageCount, requestScope)
          if (cancelled) return
          applyRefreshedPages(storyId, selection, pages, requestScope)
        } catch {
          if (!cancelled) markFailed(storyId, selection, requestScope)
        } finally {
          requestScope.active.delete(storyId)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // The generation owns this refresh; selection/state are snapshots of the current story scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation, requestScope])

  async function loadStoryMore(storyId: string) {
    const selection = selections.get(storyId)
    if (!selection) return
    const state = currentStoryState.byStory[storyId]
    if (state && state.primaryId !== selection.primaryId) return
    if (requestScope.active.has(storyId)) return
    requestScope.active.add(storyId)
    const pendingRefresh = requestScope.pendingRefresh.get(storyId)
    if (state?.error && pendingRefresh?.primaryId === selection.primaryId) {
      patchStory(storyId, selection, requestScope, { loading: true, error: false })
      try {
        const pages = await fetchRefreshedPages(
          storyId,
          selection,
          pendingRefresh.pageCount,
          requestScope,
        )
        applyRefreshedPages(storyId, selection, pages, requestScope)
      } catch {
        markFailed(storyId, selection, requestScope)
      } finally {
        requestScope.active.delete(storyId)
      }
      return
    }
    const pageInfo = state?.pages.at(-1)?.page_info ?? selection.preview.page_info
    if (!pageInfo.has_next_page || !pageInfo.end_cursor) {
      requestScope.active.delete(storyId)
      return
    }
    patchStory(storyId, selection, requestScope, { loading: true, error: false })
    try {
      const response = await getStoryMemberPage(storyId, {
        after: pageInfo.end_cursor,
        excludeItemId: selection.primaryId,
      })
      if (
        requestScopeRef.current !== requestScope ||
        latestSelections.current.get(storyId)?.primaryId !== selection.primaryId
      )
        return
      setStoryState(previous => {
        if (previous.key !== requestScope.key || previous.viewerId !== requestScope.viewerId)
          return previous
        const prior = previous.byStory[storyId]
        if (prior && prior.primaryId !== selection.primaryId) return previous
        return updateStory(previous, requestScope, storyId, selection.primaryId, {
          pages: [...(prior?.pages ?? []), response],
          loading: false,
          error: false,
        })
      })
    } catch {
      markFailed(storyId, selection, requestScope)
    } finally {
      requestScope.active.delete(storyId)
    }
  }

  return { byStory: currentStoryState.byStory, loadMore: loadStoryMore }
}
