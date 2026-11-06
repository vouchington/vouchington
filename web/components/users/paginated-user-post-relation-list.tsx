'use client'

import { HackerNewsReferencesProvider } from '@/components/hacker-news/hacker-news-references-context'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { getPaginatedQueryKey } from '@vouchington/api-client'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { useQueryScopedRemovals } from '@/hooks/use-query-scoped-removals'
import type { PostsListResponseBody } from '@/types/api-responses'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { RelationManagementActionConfig } from './relation-management-action'
import { UserPostRelationList } from './user-post-relation-list'
import { useHackerNewsReferenceRefresh } from '@/components/hacker-news/use-hacker-news-reference-refresh'

interface PaginatedUserPostRelationListProps {
  data: PostsListResponseBody
  endpoint: string
  emptyTitle: string
  emptyDescription: string
  relationAction?: RelationManagementActionConfig
}

export function PaginatedUserPostRelationList({
  data,
  endpoint,
  emptyTitle,
  emptyDescription,
  relationAction,
}: PaginatedUserPostRelationListProps) {
  const pagination = usePaginatedList(data, endpoint, {})
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    pagination
  const retryReferenceRefresh = useHackerNewsReferenceRefresh(
    pagination.refreshLoadedPages,
    endpoint,
    {},
    pagination.fetchError,
    pagination.resetKey,
  )
  const { remove: removePost, removedIds } = useQueryScopedRemovals(
    getPaginatedQueryKey(endpoint, {}),
  )
  const posts = mergePageResultsById(pages).filter(post => !removedIds.has(post.id))
  const hackerNewsReferences = mergeRecords(pages, page => page.post_hacker_news_references ?? {})
  const canLoadMore = hasNextPage && !!endpoint

  return (
    <InfiniteScroll
      hasNextPage={canLoadMore}
      endCursor={endCursor}
      onLoadMore={retryReferenceRefresh.handleLoadMore(loadMore)}
      loadingMore={loadingMore}
      fetchError={fetchError}
      clearError={clearError}
      resetKey={resetKey}
    >
      <HackerNewsReferencesProvider references={hackerNewsReferences}>
        <UserPostRelationList
          posts={posts}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          relationAction={relationAction}
          onRemoved={removePost}
        />
      </HackerNewsReferencesProvider>
    </InfiniteScroll>
  )
}
