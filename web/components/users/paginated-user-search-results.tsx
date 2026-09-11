'use client'

import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { UsersSearchResponseBody } from '@/types/api-responses'
import { UserList } from './user-list'

export function PaginatedUserSearchResults({
  initialData,
  query,
  emptyTitle,
  emptyDescription,
  currentUserId,
  showAdminAffordances,
}: {
  initialData: UsersSearchResponseBody
  query: string
  emptyTitle: string
  emptyDescription: string
  currentUserId?: string
  showAdminAffordances?: boolean
}) {
  const state = usePaginatedList(initialData, '/api/v1/users', { q: query, limit: 25 })
  const users = mergePageResultsById(state.pages)
  const muted = mergeRecords(state.pages, page => page.muted ?? {})
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
      <UserList
        users={users}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        showAdminAffordances={showAdminAffordances}
        searchMode
        currentUserId={currentUserId}
        muted={muted}
      />
    </InfiniteScroll>
  )
}
