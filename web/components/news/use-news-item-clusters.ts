'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePaginatedList, type PaginatedListParams } from '@/hooks/use-paginated-list'
import { mergeRecords } from '@ts-shared/utils/collections'
import { getStoryMemberPage } from '@/lib/api/client/stories'
import { useAuth } from '@/lib/auth/context'
import { RSS_ITEM_HIDDEN_EVENT } from '@/lib/rss-item-modal'
import {
  buildClusters,
  orderedVisibleItemIds,
  selectFirstStoryPages,
  updateStory,
  type FirstStorySelectionState,
  type StoryState,
} from './news-item-cluster-projection'
import { mergeClusterPages } from './news-item-cluster-sidecars'
import { retainFirstStorySelections } from './news-item-cluster-selection-state'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'

export type NewsItemClusterData = ReturnType<typeof useNewsItemClusters>['visibleClusters'][number]

export function useNewsItemClusters(
  data: RssFeedItemsFeedResponseBody,
  nextPageEndpoint: string,
  nextPageParams: PaginatedListParams,
) {
  const pagination = usePaginatedList(data, nextPageEndpoint, nextPageParams)
  const { pages } = pagination
  const viewerId = useAuth().currentUser?.id ?? null
  const requestScope = useMemo(
    () => ({ key: pagination.resetKey, viewerId, active: new Set<string>() }),
    [pagination.resetKey, viewerId],
  )
  const requestScopeRef = useRef(requestScope)
  useLayoutEffect(() => {
    requestScopeRef.current = requestScope
  }, [requestScope])
  const [storyState, setStoryState] = useState<StoryState>({
    key: pagination.resetKey,
    viewerId,
    byStory: {},
  })
  const currentStoryState =
    storyState.key === pagination.resetKey && storyState.viewerId === viewerId
      ? storyState
      : { key: pagination.resetKey, viewerId, byStory: {} }
  if (currentStoryState !== storyState) setStoryState(currentStoryState)
  const [expansion, setExpansion] = useState({
    key: pagination.resetKey,
    viewerId,
    ids: new Set<string>(),
  })
  const currentExpansion =
    expansion.key === pagination.resetKey && expansion.viewerId === viewerId
      ? expansion
      : { key: pagination.resetKey, viewerId, ids: new Set<string>() }
  if (currentExpansion !== expansion) setExpansion(currentExpansion)
  const [hiddenItemIds, setHiddenItemIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    function onItemHidden(event: Event) {
      if (!(event instanceof CustomEvent) || typeof event.detail?.id !== 'string') return
      setHiddenItemIds(prev => new Set([...prev, event.detail.id]))
    }
    window.addEventListener(RSS_ITEM_HIDDEN_EVENT, onItemHidden)
    return () => window.removeEventListener(RSS_ITEM_HIDDEN_EVENT, onItemHidden)
  }, [])

  const allFeedItems = mergeRecords(pages, page => page.rss_feed_items)
  const candidates = selectFirstStoryPages(pages, allFeedItems)
  const [firstSelections, setFirstSelections] = useState<FirstStorySelectionState>({
    key: pagination.resetKey,
    viewerId,
    byStory: new Map(),
  })
  const retainedSelections = retainFirstStorySelections(
    firstSelections,
    { key: pagination.resetKey, viewerId },
    candidates,
  )
  if (retainedSelections !== firstSelections) setFirstSelections(retainedSelections)
  const selections = retainedSelections.byStory
  const feedPages = [...new Set([...selections.values()].map(s => s.sourcePage).concat(pages))]
  const latestSelections = useRef(selections)
  useLayoutEffect(() => {
    latestSelections.current = selections
  }, [selections])
  const continuationPages = Object.entries(currentStoryState.byStory).flatMap(([storyId, state]) =>
    selections.get(storyId)?.primaryId === state.primaryId ? state.pages : [],
  )
  const merged = mergeClusterPages(pages, feedPages, continuationPages)
  const clusters = buildClusters(
    merged.allResults,
    merged.allItems,
    selections,
    currentStoryState.byStory,
  )
  const visibleClusters = clusters.flatMap(cluster => {
    if (hiddenItemIds.has(cluster.primary.id)) return []
    return [
      { ...cluster, storyItems: cluster.storyItems.filter(item => !hiddenItemIds.has(item.id)) },
    ]
  })
  const orderedItemIds = orderedVisibleItemIds(visibleClusters, currentExpansion.ids)

  function setExpandedStoryIds(action: React.SetStateAction<Set<string>>) {
    setExpansion(previous => {
      if (previous.key !== pagination.resetKey || previous.viewerId !== viewerId) return previous
      const ids = typeof action === 'function' ? action(previous.ids) : action
      return { ...previous, ids }
    })
  }

  async function loadStoryMore(storyId: string) {
    const selection = selections.get(storyId)
    if (!selection) return
    const state = currentStoryState.byStory[storyId]
    if (state && state.primaryId !== selection.primaryId) return
    const pageInfo = state?.pages.at(-1)?.page_info ?? selection.preview.page_info
    if (!pageInfo.has_next_page || !pageInfo.end_cursor) return
    const scope = requestScope
    if (scope.active.has(storyId)) return
    scope.active.add(storyId)
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

  return {
    ...pagination,
    ...merged,
    expandedStoryIds: currentExpansion.ids,
    handleExpandedStoryIdsChange: setExpandedStoryIds,
    handleLoadMore: pagination.loadMore,
    handleLoadStoryMore: loadStoryMore,
    orderedItemIds,
    visibleClusters,
  }
}
