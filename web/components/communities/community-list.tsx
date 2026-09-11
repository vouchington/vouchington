'use client'

/**
 * Community list component with infinite scroll
 * Displays a grid of community cards, accumulating pages client-side
 */

import { CommunityCard } from './community-card'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { EmptyState } from '@/components/shared/empty-state'
import { usePaginatedList, type PaginatedListParams } from '@/hooks/use-paginated-list'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { CommunitiesSearchResponseBody } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

interface CommunityListProps {
  data: CommunitiesSearchResponseBody
  /** API endpoint for fetching subsequent pages, e.g. '/api/v1/communities' */
  nextPageEndpoint?: string
  /** Query params shared across all pages (excluding the `after` cursor) */
  nextPageParams?: PaginatedListParams
}
const EMPTY_PAGE_PARAMS: PaginatedListParams = {}

export function CommunityList({
  data,
  nextPageEndpoint = '',
  nextPageParams = EMPTY_PAGE_PARAMS,
}: CommunityListProps) {
  const t = useTranslations()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(data, nextPageEndpoint, nextPageParams)

  const allResults = mergePageResultsById(pages)
  const allCommunities = mergeRecords(pages, page => page.communities)
  const allMetrics = mergeRecords(pages, page => page.community_metrics ?? {})
  const allMemberships = mergeRecords(pages, page => page.community_memberships ?? {})
  const allPendingIds = new Set(pages.flatMap(page => page.pending_application_community_ids ?? []))

  if (allResults.length === 0) {
    return (
      <EmptyState
        icon='search'
        title={t('extracted.communities.communityList.noCommunitiesFound_1875e081')}
        description={t('extracted.communities.communityList.checkBackLaterOrTryAdjusting_e1730dbd')}
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
      <div className='space-y-3'>
        {allResults.map(result => {
          const community = allCommunities[result.id]
          if (!community) return null

          return (
            <CommunityCard
              key={community.id}
              community={community}
              metrics={allMetrics[community.id]}
              membership={allMemberships[community.id]}
              hasPendingApplication={allPendingIds.has(community.id)}
            />
          )
        })}
      </div>
    </InfiniteScroll>
  )
}
