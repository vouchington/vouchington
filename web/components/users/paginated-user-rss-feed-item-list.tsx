'use client'

import type { ReactNode } from 'react'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList, type PaginatedListParams } from '@/hooks/use-paginated-list'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { RssFeedItemsListResponseBody } from '@/types/api-responses'
import type { RelationManagementActionConfig } from './relation-management-action'
import { UserRssFeedItemList } from './user-rss-feed-item-list'

/** Saved and hidden item pages can be empty while a later page still matches. */
export function PaginatedUserRssFeedItemList({
  initialData,
  endpoint,
  params,
  emptyTitle,
  emptyDescription,
  relationAction,
  children,
}: {
  initialData: RssFeedItemsListResponseBody
  endpoint: string
  params?: PaginatedListParams
  emptyTitle: string
  emptyDescription: string
  relationAction?: RelationManagementActionConfig
  children?: ReactNode
}) {
  const state = usePaginatedList(initialData, endpoint, params ?? {})
  const handleLoadMore = state.loadMore

  return (
    <InfiniteScroll
      hasNextPage={state.hasNextPage}
      endCursor={state.endCursor}
      onLoadMore={handleLoadMore}
      loadingMore={state.loadingMore}
      fetchError={state.fetchError}
      clearError={state.clearError}
      resetKey={state.resetKey}
    >
      <UserRssFeedItemList
        items={mergePageResultsById(state.pages)}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        relationAction={relationAction}
        thumbnailUrls={mergeRecords(state.pages, page => page.rss_feed_item_thumbnail_url ?? {})}
        embeds={mergeRecords(state.pages, page => page.rss_feed_item_embeds ?? {})}
        hackerNewsReferences={mergeRecords(
          state.pages,
          page => page.rss_feed_item_hacker_news_references ?? {},
        )}
      >
        {children}
      </UserRssFeedItemList>
    </InfiniteScroll>
  )
}
