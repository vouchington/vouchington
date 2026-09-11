'use client'

import { useEffect, useState } from 'react'
import { usePaginatedList, type PaginatedListParams } from '@/hooks/use-paginated-list'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'
import { RSS_ITEM_HIDDEN_EVENT } from '@/lib/rss-item-modal'

export type NewsItemClusterData = ReturnType<typeof useNewsItemClusters>['visibleClusters'][number]

export function useNewsItemClusters(
  data: RssFeedItemsFeedResponseBody,
  nextPageEndpoint: string,
  nextPageParams: PaginatedListParams,
) {
  const pagination = usePaginatedList(data, nextPageEndpoint, nextPageParams)
  const { pages } = pagination
  const [hiddenItemIds, setHiddenItemIds] = useState<Set<string>>(new Set())
  const [expandedStoryIds, setExpandedStoryIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    function onItemHidden(event: Event) {
      if (!(event instanceof CustomEvent) || typeof event.detail?.id !== 'string') return
      setHiddenItemIds(prev => new Set([...prev, event.detail.id]))
    }
    window.addEventListener(RSS_ITEM_HIDDEN_EVENT, onItemHidden)
    return () => window.removeEventListener(RSS_ITEM_HIDDEN_EVENT, onItemHidden)
  }, [])

  const merged = {
    allBookmarks: mergeRecords(pages, page => page.bookmarks ?? {}),
    allElectionVotes: mergeRecords(pages, page => page.election_votes ?? {}),
    allElections: mergeRecords(pages, page => page.rss_feed_item_elections),
    allItems: mergeRecords(pages, page => page.rss_feed_items),
    allPosts: mergeRecords(pages, page => page.posts ?? {}),
    allRelatedPostsByUrlId: mergeRecords(pages, page => page.related_posts_by_url_id ?? {}),
    allResults: mergePageResultsById(pages),
    allStories: mergeRecords(pages, page => page.stories ?? {}),
    allStoryMemberIds: mergeRecords(pages, page => page.story_member_ids ?? {}),
    allStoryPostIds: mergeRecords(pages, page => page.story_post_ids ?? {}),
    allThumbnailUrls: mergeRecords(pages, page => page.rss_feed_item_thumbnail_url ?? {}),
    allEmbeds: mergeRecords(pages, page => page.rss_feed_item_embeds ?? {}),
    allUsers: mergeRecords(pages, page => page.users ?? {}),
  }
  const clusters = buildClusters(merged.allResults, merged.allItems, merged.allStoryMemberIds)
  const visibleClusters = clusters.flatMap(cluster => {
    if (hiddenItemIds.has(cluster.primary.id)) return []
    return [
      { ...cluster, storyItems: cluster.storyItems.filter(item => !hiddenItemIds.has(item.id)) },
    ]
  })
  const orderedItemIds = orderedVisibleItemIds(visibleClusters, expandedStoryIds)

  return {
    ...pagination,
    ...merged,
    expandedStoryIds,
    handleExpandedStoryIdsChange: setExpandedStoryIds,
    handleLoadMore: pagination.loadMore,
    orderedItemIds,
    visibleClusters,
  }
}

function buildClusters(
  allResults: RssFeedItemsFeedResponseBody['results'],
  allItems: RssFeedItemsFeedResponseBody['rss_feed_items'],
  allStoryMemberIds: NonNullable<RssFeedItemsFeedResponseBody['story_member_ids']>,
) {
  const seenStoryIds = new Set<string>()
  const seenItemIds = new Set<string>()
  const clusters: Array<{
    primaryResult: (typeof allResults)[number]
    primary: NonNullable<(typeof allItems)[string]>
    storyItems: NonNullable<(typeof allItems)[string]>[]
    storyId: string | null
  }> = []

  for (const result of allResults) {
    const cluster = buildCluster(result, allItems, allStoryMemberIds, seenItemIds, seenStoryIds)
    if (cluster) clusters.push(cluster)
  }

  return clusters
}

function buildCluster(
  result: RssFeedItemsFeedResponseBody['results'][number],
  allItems: RssFeedItemsFeedResponseBody['rss_feed_items'],
  allStoryMemberIds: NonNullable<RssFeedItemsFeedResponseBody['story_member_ids']>,
  seenItemIds: Set<string>,
  seenStoryIds: Set<string>,
) {
  const primaryItemId = result.entity_id ?? result.id
  const primary = allItems[primaryItemId]
  if (!primary) return null

  if (result.delivery_type === 'share') {
    return { primaryResult: result, primary, storyItems: [], storyId: null }
  }

  if (seenItemIds.has(primaryItemId)) return null
  seenItemIds.add(primaryItemId)
  const storyId = result.story_id ?? null
  if (!storyId) return { primaryResult: result, primary, storyItems: [], storyId: null }
  if (seenStoryIds.has(storyId)) return null
  seenStoryIds.add(storyId)

  const storyItems = (allStoryMemberIds[storyId] ?? []).flatMap(id => {
    if (id === primaryItemId || seenItemIds.has(id)) return []
    const item = allItems[id]
    return item !== undefined ? [item] : []
  })
  for (const item of storyItems) seenItemIds.add(item.id)

  return { primaryResult: result, primary, storyItems, storyId }
}

function orderedVisibleItemIds(
  visibleClusters: ReturnType<typeof buildClusters>,
  expandedStoryIds: Set<string>,
) {
  return [
    ...new Set(
      visibleClusters.flatMap(cluster => {
        if (!cluster.storyId || !expandedStoryIds.has(cluster.storyId)) return [cluster.primary.id]
        return [cluster.primary.id, ...cluster.storyItems.map(item => item.id)]
      }),
    ),
  ]
}
