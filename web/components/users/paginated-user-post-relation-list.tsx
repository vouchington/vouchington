'use client'

import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { getPaginatedQueryKey } from '@/hooks/paginated-query-key'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { useQueryScopedRemovals } from '@/hooks/use-query-scoped-removals'
import type { PostsListResponseBody } from '@/types/api-responses'
import { mergePageResultsById } from '@ts-shared/utils/collections'
import type { RelationManagementActionConfig } from './relation-management-action'
import { UserPostRelationList } from './user-post-relation-list'

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
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(data, endpoint, {})
  const { remove: removePost, removedIds } = useQueryScopedRemovals(
    getPaginatedQueryKey(endpoint, {}),
  )
  const posts = mergePageResultsById(pages).filter(post => !removedIds.has(post.id))
  const canLoadMore = hasNextPage && !!endpoint

  return (
    <InfiniteScroll
      hasNextPage={canLoadMore}
      endCursor={endCursor}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      fetchError={fetchError}
      clearError={clearError}
      resetKey={resetKey}
    >
      <UserPostRelationList
        posts={posts}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        relationAction={relationAction}
        onRemoved={removePost}
      />
    </InfiniteScroll>
  )
}
