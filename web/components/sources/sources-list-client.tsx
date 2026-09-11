'use client'

import { usePaginatedList } from '@/hooks/use-paginated-list'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { RssFeedListItem } from '@/components/sources/rss-feed-list-item'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { RssFeedsListResponseBody } from '@/types/api-responses'

type SourcesListClientProps = {
  initialData: RssFeedsListResponseBody
  searchParams: { q?: string; publisherType?: string }
}

export function SourcesListClient({ initialData, searchParams }: SourcesListClientProps) {
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(initialData, '/api/v1/rss-feeds', {
      q: searchParams.q,
      publisher_type: searchParams.publisherType,
      include_descendants: true,
      enabled: true,
      apply_mutes: true,
    })

  const allResults = mergePageResultsById(pages)
  const allTopicElections = mergeRecords(pages, page => page.topic_elections)
  const allHostnameElections = mergeRecords(pages, page => page.hostname_elections)
  const allElectionVotes = mergeRecords(pages, page => page.election_votes ?? {})
  const allBookmarks = mergeRecords(pages, page => page.bookmarks ?? {})

  const canLoadMore = hasNextPage && !!endCursor

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
      <div className='space-y-4'>
        {allResults.map(feed => (
          <RssFeedListItem
            key={feed.id}
            feed={feed}
            isFollowing={allBookmarks[feed.id]?.follow === true}
            isFollowingTopic={allBookmarks[feed.topic.id]?.follow === true}
            hostnameElection={
              feed.hostname?.id ? allHostnameElections[feed.hostname.id] : undefined
            }
            topicElection={allTopicElections[feed.topic.id]}
            electionVoteChoice={
              allElectionVotes[feed.topic.id]?.choice as
                | import('@/lib/api/client/elections').SentimentChoice
                | undefined
            }
          />
        ))}
      </div>
    </InfiniteScroll>
  )
}
