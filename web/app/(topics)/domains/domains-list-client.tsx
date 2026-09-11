'use client'

import { usePaginatedList } from '@/hooks/use-paginated-list'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { EmptyState } from '@/components/shared/empty-state'
import { HostnameListItem } from '@/components/domains/hostname-list-item'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { HostnameListResponse } from '@/types/hostnames'
import { useTranslations } from '@/lib/i18n/use-translations'

interface DomainsListClientProps {
  initialData: HostnameListResponse
  isAdmin: boolean
  signedIn: boolean
  searchParams: { query?: string; blocked?: string; crawlable?: string }
}

export function DomainsListClient({
  initialData,
  isAdmin,
  signedIn,
  searchParams,
}: DomainsListClientProps) {
  const t = useTranslations()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(initialData, '/api/v1/hostnames', {
      query: searchParams.query,
      blocked: searchParams.blocked,
      crawlable: searchParams.crawlable,
    })

  const allResults = mergePageResultsById(pages)
  const allHostnames = mergeRecords(pages, page => page.hostnames)
  const allTopics = mergeRecords(pages, page => page.topics ?? {})
  const allElections = mergeRecords(pages, page => page.hostname_elections ?? {})
  const allVotes = mergeRecords(pages, page => page.election_votes ?? {})

  if (allResults.length === 0) {
    return (
      <EmptyState
        title={t('extracted.domains.domainsListClient.noDomainsFound_7bb966c1')}
        description={
          searchParams.query
            ? t('extracted.domains.domainsListClient.noDomainsMatchYourSearchTry_16de725d')
            : t('extracted.domains.domainsListClient.noDomainsHaveBeenAddedYet_a7fb2626')
        }
        icon='search'
      />
    )
  }

  return (
    <InfiniteScroll
      hasNextPage={hasNextPage}
      endCursor={endCursor}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      fetchError={fetchError}
      clearError={clearError}
      resetKey={resetKey}
    >
      <div className='space-y-4'>
        {allResults.map(ref => {
          const hostname = allHostnames[ref.id]
          if (!hostname) return null
          const topic = hostname.topic_id ? allTopics[hostname.topic_id] : undefined
          const election = allElections[ref.id]
          const electionVote = allVotes[ref.id]

          return (
            <HostnameListItem
              key={ref.id}
              hostname={hostname}
              election={election}
              electionVote={electionVote}
              topic={topic}
              isAdmin={isAdmin}
              signedOut={!signedIn}
            />
          )
        })}
      </div>
    </InfiniteScroll>
  )
}
