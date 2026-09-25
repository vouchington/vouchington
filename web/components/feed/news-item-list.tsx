'use client'

/**
 * News item list with infinite scroll
 * Accumulates pages client-side to avoid replacing content on navigation
 */

import { type ReactNode, useEffect, useState } from 'react'
import { NewsItemCard } from './news-item-card'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { EmptyState } from '@/components/shared/empty-state'
import { NewsItemActions } from '@/components/news/news-item-actions'
import { useFeedStyle } from '@/lib/preferences/use-feed-style'
import { usePaginatedList, type PaginatedListParams } from '@/hooks/use-paginated-list'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'
import { RssItemNavProvider } from '@/lib/rss-item-nav-provider'
import { RSS_ITEM_HIDDEN_EVENT } from '@/lib/rss-item-modal'
import { useTranslations } from '@/lib/i18n/use-translations'

interface NewsItemListProps {
  data: RssFeedItemsFeedResponseBody
  nextPageEndpoint?: string
  nextPageParams?: PaginatedListParams
  /** Modal rendered inside the nav context so it can access orderedItemIds. */
  children?: ReactNode
}

const EMPTY_PAGE_PARAMS: PaginatedListParams = {}

export function NewsItemList({
  data,
  nextPageEndpoint = '',
  nextPageParams = EMPTY_PAGE_PARAMS,
  children,
}: NewsItemListProps) {
  const t = useTranslations()
  const { feedStyle } = useFeedStyle()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(data, nextPageEndpoint, nextPageParams)
  const [hiddenItemIds, setHiddenItemIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    function onItemHidden(event: Event) {
      if (!(event instanceof CustomEvent) || typeof event.detail?.id !== 'string') return
      const { id } = event.detail
      setHiddenItemIds(prev => new Set([...prev, id]))
    }
    window.addEventListener(RSS_ITEM_HIDDEN_EVENT, onItemHidden)
    return () => window.removeEventListener(RSS_ITEM_HIDDEN_EVENT, onItemHidden)
  }, [])

  const allResults = mergePageResultsById(pages)
  const allItems = mergeRecords(pages, page => page.rss_feed_items)
  const allElections = mergeRecords(pages, page => page.rss_feed_item_elections)
  const allThumbnailUrls = mergeRecords(pages, page => page.rss_feed_item_thumbnail_url ?? {})
  const allEmbeds = mergeRecords(pages, page => page.rss_feed_item_embeds ?? {})
  const allRelatedPostsByUrlId = mergeRecords(pages, page => page.related_posts_by_url_id ?? {})
  const allPosts = mergeRecords(pages, page => page.posts ?? {})
  const allBookmarks = mergeRecords(pages, page => page.bookmarks ?? {})
  const allUsers = mergeRecords(pages, page => page.users ?? {})

  // Derived from visible results so hidden items are excluded from modal navigation.
  const visibleResults = allResults.filter(
    result => !hiddenItemIds.has(result.entity_id ?? result.id),
  )
  const orderedItemIds = [...new Set(visibleResults.map(result => result.entity_id ?? result.id))]

  if (allResults.length === 0) {
    return (
      <EmptyState
        title={t('extracted.feed.newsItemList.noNewsFound_1cb8f117')}
        description={t('extracted.feed.newsItemList.followTopicsOrSourcesToSee_48a88aa2')}
        icon='inbox'
      />
    )
  }

  const canLoadMore = hasNextPage && !!nextPageEndpoint

  return (
    <RssItemNavProvider
      orderedItemIds={orderedItemIds}
      hasNextPage={canLoadMore}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
    >
      <InfiniteScroll
        hasNextPage={canLoadMore}
        endCursor={endCursor}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
        fetchError={fetchError}
        clearError={clearError}
        resetKey={resetKey}
      >
        <div className='space-y-4'>
          {visibleResults.map(result => {
            const item = allItems[result.entity_id ?? result.id]
            if (!item) return null

            const relatedPostIds = allRelatedPostsByUrlId[item.url.id] ?? []
            const relatedPosts = relatedPostIds.flatMap(id => (allPosts[id] ? [allPosts[id]] : []))
            const viewerBookmarks = allBookmarks[item.id]

            return (
              <NewsItemCard
                key={result.id}
                item={item}
                view={feedStyle}
                thumbnailUrl={allThumbnailUrls[item.id]}
                embed={allEmbeds[item.id]}
                sharedByUser={
                  result.shared_by_user_id ? allUsers[result.shared_by_user_id] : undefined
                }
                sharedAt={result.shared_at}
                footer={modalHref => (
                  <NewsItemActions
                    item={item}
                    election={allElections[item.id]}
                    relatedPosts={relatedPosts}
                    viewerBookmarks={viewerBookmarks}
                    leadingHref={modalHref}
                  />
                )}
              />
            )
          })}
        </div>
      </InfiniteScroll>
      {children}
    </RssItemNavProvider>
  )
}
