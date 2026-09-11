'use client'

import { EmptyState } from '@/components/shared/empty-state'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { RssFeedListItem } from '@/components/sources/rss-feed-list-item'
import { usePaginatedList, type PaginatedListParams } from '@/hooks/use-paginated-list'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { RssFeedsListResponseBody } from '@/types/api-responses'

export function PaginatedUserRssFeedList({
  initialData,
  endpoint,
  params,
  emptyTitle,
  emptyDescription,
  refreshOnUnfollow = false,
}: {
  initialData: RssFeedsListResponseBody
  endpoint: string
  params?: PaginatedListParams
  emptyTitle: string
  emptyDescription: string
  refreshOnUnfollow?: boolean
}) {
  const state = usePaginatedList(initialData, endpoint, params ?? {})
  const results = mergePageResultsById(state.pages)
  const bookmarks = mergeRecords(state.pages, page => page.bookmarks ?? {})
  const topicElections = mergeRecords(state.pages, page => page.topic_elections)
  const hostnameElections = mergeRecords(state.pages, page => page.hostname_elections)
  const electionVotes = mergeRecords(state.pages, page => page.election_votes ?? {})
  const handleLoadMore = state.loadMore

  if (results.length === 0) {
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
        {results.map(feed => (
          <RssFeedListItem
            key={feed.id}
            feed={feed}
            isFollowing={bookmarks[feed.id]?.follow === true}
            isFollowingTopic={bookmarks[feed.topic.id]?.follow === true}
            hostnameElection={feed.hostname?.id ? hostnameElections[feed.hostname.id] : undefined}
            topicElection={topicElections[feed.topic.id]}
            electionVoteChoice={
              electionVotes[feed.topic.id]?.choice as
                | import('@/lib/api/client/elections').SentimentChoice
                | undefined
            }
            refreshOnUnfollow={refreshOnUnfollow}
          />
        ))}
      </div>
    </InfiniteScroll>
  )
}
