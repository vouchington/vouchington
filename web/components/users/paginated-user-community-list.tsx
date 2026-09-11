'use client'

import { CommunityCard } from '@/components/communities/community-card'
import { EmptyState } from '@/components/shared/empty-state'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { mergePageResultsById } from '@ts-shared/utils/collections'
import type { CommunitiesListResponseBody } from '@/types/api-responses'

export function PaginatedUserCommunityList({
  initialData,
  endpoint,
  emptyTitle,
  emptyDescription,
}: {
  initialData: CommunitiesListResponseBody
  endpoint: string
  emptyTitle: string
  emptyDescription: string
}) {
  const state = usePaginatedList(initialData, endpoint, {})
  const communities = mergePageResultsById(state.pages)
  const handleLoadMore = state.loadMore
  if (communities.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }

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
      <div className='space-y-4'>
        {communities.map(community => (
          <CommunityCard
            key={community.id}
            community={community}
            hideJoinButton
          />
        ))}
      </div>
    </InfiniteScroll>
  )
}
