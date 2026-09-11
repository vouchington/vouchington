'use client'

/**
 * Topic list component with infinite scroll
 * Displays a list of topic cards, accumulating pages client-side
 */

import { TopicCard } from './topic-card'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { EmptyState } from '@/components/shared/empty-state'
import { usePaginatedList, type PaginatedListParams } from '@/hooks/use-paginated-list'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { TopicsResponseBody } from '@/types/api-responses'
import type { FediverseInstanceAttributes } from '@/types/fediverse-instances'
import type { HostnameElection } from '@/types/hostnames'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getFediverseInstancesContinuationPage } from '@/lib/api/client/fediverse-instances'

export interface TopicListProps {
  data: TopicsResponseBody & {
    fediverse_instances?: Record<string, FediverseInstanceAttributes>
    hostname_elections?: Record<string, HostnameElection>
  }
  /** API endpoint for fetching subsequent pages, e.g. '/api/v1/topics' */
  nextPageEndpoint?: string
  /** Query params shared across all pages (excluding the `after` cursor) */
  nextPageParams?: PaginatedListParams
  normalizeFediversePages?: boolean
}

const EMPTY_PAGE_PARAMS: PaginatedListParams = {}

export function TopicList({
  data,
  nextPageEndpoint = '',
  nextPageParams = EMPTY_PAGE_PARAMS,
  normalizeFediversePages = false,
}: TopicListProps) {
  const t = useTranslations()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(data, nextPageEndpoint, nextPageParams, {
      fetchPage: normalizeFediversePages ? getFediverseInstancesContinuationPage : undefined,
    })

  const allResults = mergePageResultsById(pages)
  const allTopics = mergeRecords(pages, page => page.topics)
  const allMetrics = mergeRecords(pages, page => page.topics_metrics)
  const allElections = mergeRecords(pages, page => page.topic_elections ?? {})
  const allBookmarks = mergeRecords(pages, page => page.bookmarks ?? {})
  const allElectionVotes = mergeRecords(pages, page => page.election_votes ?? {})
  const allFediverseInstances = mergeRecords(pages, page => page.fediverse_instances ?? {})
  const allHostnameElections = mergeRecords(pages, page => page.hostname_elections ?? {})

  if (allResults.length === 0) {
    return (
      <EmptyState
        title={t('extracted.topics.topicList.noTopicsFound_a32677cf')}
        description={t('extracted.topics.topicList.tryAdjustingYourSearchOrFilters_54f7b4c2')}
      />
    )
  }

  const canLoadMore = hasNextPage && !!nextPageEndpoint

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
        {allResults.map(result => {
          const topic = allTopics[result.id]
          if (!topic) return null

          return (
            <TopicCard
              key={topic.id}
              topic={topic}
              metrics={allMetrics[topic.id]}
              election={allElections[topic.id]}
              isFollowing={allBookmarks[topic.id]?.follow}
              isMuted={allBookmarks[topic.id]?.mute}
              electionVoteChoice={
                allElectionVotes[topic.id]?.choice as
                  | import('@/lib/api/client/elections').SentimentChoice
                  | undefined
              }
              fediverseInstance={allFediverseInstances[topic.id]}
              hostnameElection={
                topic.hostname?.id ? allHostnameElections[topic.hostname.id] : undefined
              }
            />
          )
        })}
      </div>
    </InfiniteScroll>
  )
}
