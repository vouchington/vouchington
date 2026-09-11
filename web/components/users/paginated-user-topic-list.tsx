'use client'

import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { mergePageResultsById } from '@ts-shared/utils/collections'
import type { TopicsListResponseBody } from '@/types/api-responses'
import { UserTopicList } from './user-topic-list'

export function PaginatedUserTopicList({
  initialData,
  endpoint,
  emptyTitle,
  emptyDescription,
}: {
  initialData: TopicsListResponseBody
  endpoint: string
  emptyTitle: string
  emptyDescription: string
}) {
  const state = usePaginatedList(initialData, endpoint, {})
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
      <UserTopicList
        topics={mergePageResultsById(state.pages)}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
      />
    </InfiniteScroll>
  )
}
