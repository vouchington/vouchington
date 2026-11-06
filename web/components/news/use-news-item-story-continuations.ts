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
  const latestSelections = useRef(selections)
  useLayoutEffect(() => {
    latestSelections.current = selections
  }, [selections])

  async function refreshStoryPages(
    storyId: string,
    selection: FirstStorySelection,
    pageCount: number,
    scope: typeof requestScope,
  ) {
    const refreshedPages = await refreshStoryMemberPages(
      storyId,
      selection,
      pageCount,
      () =>
        requestScopeRef.current === scope &&
        latestSelections.current.get(storyId)?.primaryId === selection.primaryId,
    )
    if (refreshedPages) {
      scope.pendingRefresh.delete(storyId)
      setStoryState(previous =>
        updateStory(previous, scope, storyId, selection.primaryId, {
          pages: refreshedPages,
          loading: false,
          error: false,
        }),
      )
    }
  }

  /* oxlint-disable react-you-might-not-need-an-effect/no-event-handler -- synchronize external story pages when the server acknowledges changed reference visibility */
  useEffect(() => {
    if (generation === 0) return
    const scope = requestScope
    const storiesToRefresh = Object.entries(currentStoryState.byStory).filter(
      ([storyId, state]) =>
        selections.get(storyId)?.primaryId === state.primaryId &&
        (state.pages.length > 0 || state.loading),
    )
    void (async () => {
      for (const [storyId, state] of storiesToRefresh) {
        if (requestScopeRef.current !== scope) return
        if (scope.active.has(storyId)) continue
        const selection = selections.get(storyId)
        if (!selection) continue
        scope.active.add(storyId)
        const pageCount = Math.max(1, state.pages.length)
        scope.pendingRefresh.set(storyId, { primaryId: selection.primaryId, pageCount })
        setStoryState(previous =>
          updateStory(previous, scope, storyId, selection.primaryId, {
            loading: true,
            error: false,
          }),
        )
        try {
          // oxlint-disable-next-line no-await-in-loop -- serialize retained stories to bound refresh concurrency
          await refreshStoryPages(storyId, selection, pageCount, scope)
        } catch {
          if (requestScopeRef.current === scope) {
            setStoryState(previous =>
              updateStory(previous, scope, storyId, selection.primaryId, {
                loading: false,
                error: true,
              }),
            )
          }
        } finally {
          scope.active.delete(storyId)
        }
      }
    })()
    // The generation owns this refresh; selection/state are snapshots of the current story scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation, requestScope])

  /* oxlint-enable react-you-might-not-need-an-effect/no-event-handler */

  async function loadStoryMore(storyId: string) {
    const selection = selections.get(storyId)
    if (!selection) return
    const state = currentStoryState.byStory[storyId]
    if (state && state.primaryId !== selection.primaryId) return
    const scope = requestScope
    if (scope.active.has(storyId)) return
    scope.active.add(storyId)
    const pendingRefresh = scope.pendingRefresh.get(storyId)
    if (state?.error && pendingRefresh?.primaryId === selection.primaryId) {
      setStoryState(previous =>
        updateStory(previous, scope, storyId, selection.primaryId, {
          loading: true,
          error: false,
        }),
      )
      try {
        await refreshStoryPages(storyId, selection, pendingRefresh.pageCount, scope)
      } catch {
        if (requestScopeRef.current === scope) {
          setStoryState(previous =>
            updateStory(previous, scope, storyId, selection.primaryId, {
              loading: false,
              error: true,
            }),
          )
        }
      } finally {
        scope.active.delete(storyId)
      }
      return
    }
    const pageInfo = state?.pages.at(-1)?.page_info ?? selection.preview.page_info
    if (!pageInfo.has_next_page || !pageInfo.end_cursor) {
      scope.active.delete(storyId)
      return
    }
    setStoryState(previous =>
      updateStory(previous, scope, storyId, selection.primaryId, {
        loading: true,
        error: false,
      }),
    )
    try {
      const response = await getStoryMemberPage(storyId, {
        after: pageInfo.end_cursor,
        excludeItemId: selection.primaryId,
      })
      if (
        requestScopeRef.current !== scope ||
        latestSelections.current.get(storyId)?.primaryId !== selection.primaryId
      )
        return
      setStoryState(previous => {
        if (previous.key !== scope.key || previous.viewerId !== scope.viewerId) return previous
        const prior = previous.byStory[storyId]
        if (prior && prior.primaryId !== selection.primaryId) return previous
        return updateStory(previous, scope, storyId, selection.primaryId, {
          pages: [...(prior?.pages ?? []), response],
          loading: false,
          error: false,
        })
      })
    } catch {
      if (requestScopeRef.current === scope) {
        setStoryState(previous =>
          updateStory(previous, scope, storyId, selection.primaryId, {
            loading: false,
            error: true,
          }),
        )
      }
    } finally {
      scope.active.delete(storyId)
    }
  }

  return { byStory: currentStoryState.byStory, loadMore: loadStoryMore }
}
