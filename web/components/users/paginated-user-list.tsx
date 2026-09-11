'use client'

import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { UsersListResponseBody } from '@/types/api-responses'
import { UserList } from './user-list'

export function PaginatedUserList({
  initialData,
  endpoint,
  emptyTitle,
  emptyDescription,
  currentUserId,
}: {
  initialData: UsersListResponseBody
  endpoint: string
  emptyTitle: string
  emptyDescription: string
  currentUserId?: string
}) {
  const state = usePaginatedList(initialData, endpoint, {})
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
        currentUserId={currentUserId}
        muted={muted}
      />
    </InfiniteScroll>
  )
}
