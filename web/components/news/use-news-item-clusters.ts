'use client'

import { useEffect, useState } from 'react'
import { usePaginatedList, type PaginatedListParams } from '@/hooks/use-paginated-list'
import { mergeRecords } from '@ts-shared/utils/collections'
import { useAuth } from '@/lib/auth/context'
import { RSS_ITEM_HIDDEN_EVENT } from '@/lib/rss-item-modal'
import {
  buildClusters,
  orderedVisibleItemIds,
  selectFirstStoryPages,
  type FirstStorySelectionState,
} from './news-item-cluster-projection'
import { mergeClusterPages } from './news-item-cluster-sidecars'
import { retainFirstStorySelections } from './news-item-cluster-selection-state'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'
import { useHackerNewsReferenceRefresh } from '@/components/hacker-news/use-hacker-news-reference-refresh'
import { useHackerNewsReferenceRefreshGeneration } from '@/components/hacker-news/hacker-news-config-context'
import { useNewsItemStoryContinuations } from './use-news-item-story-continuations'

export type NewsItemClusterData = ReturnType<typeof useNewsItemClusters>['visibleClusters'][number]

export function useNewsItemClusters(
  data: RssFeedItemsFeedResponseBody,
  nextPageEndpoint: string,
  nextPageParams: PaginatedListParams,
) {
  const pagination = usePaginatedList(data, nextPageEndpoint, nextPageParams)
  const retryReferenceRefresh = useHackerNewsReferenceRefresh(
    pagination.refreshLoadedPages,
    nextPageEndpoint,
    nextPageParams,
    pagination.fetchError,
    pagination.resetKey,
  )
  const referenceRefreshGeneration = useHackerNewsReferenceRefreshGeneration()
  const { pages } = pagination
  const viewerId = useAuth().currentUser?.id ?? null
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
  const storyContinuations = useNewsItemStoryContinuations({
    selections,
    key: pagination.resetKey,
    viewerId,
    generation: referenceRefreshGeneration,
  })
  const continuationPages = Object.entries(storyContinuations.byStory).flatMap(([storyId, state]) =>
    selections.get(storyId)?.primaryId === state.primaryId ? state.pages : [],
  )
  const merged = mergeClusterPages(pages, feedPages, continuationPages)
  const clusters = buildClusters(
    merged.allResults,
    merged.allItems,
    selections,
    storyContinuations.byStory,
  )
  const visibleClusters = clusters.flatMap(cluster => {
    if (hiddenItemIds.has(cluster.primary.id)) return []
    return [
      {
        ...cluster,
        hasMoreStoryItems: cluster.hasMoreStoryItems || cluster.storyLoadError,
        storyItems: cluster.storyItems.filter(item => !hiddenItemIds.has(item.id)),
      },
    ]
  })
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
  const orderedItemIds = orderedVisibleItemIds(visibleClusters, currentExpansion.ids)

  function setExpandedStoryIds(action: React.SetStateAction<Set<string>>) {
    setExpansion(previous => {
      if (previous.key !== pagination.resetKey || previous.viewerId !== viewerId) return previous
      const ids = typeof action === 'function' ? action(previous.ids) : action
      return { ...previous, ids }
    })
  }

  return {
    ...pagination,
    ...merged,
    expandedStoryIds: currentExpansion.ids,
    handleExpandedStoryIdsChange: setExpandedStoryIds,
    handleLoadMore: retryReferenceRefresh.handleLoadMore(pagination.loadMore),
    handleLoadStoryMore: storyContinuations.loadMore,
    orderedItemIds,
    visibleClusters,
  }
}
