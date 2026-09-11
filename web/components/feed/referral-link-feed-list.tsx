'use client'

import type { ReactNode } from 'react'
import { ReferralLinkFeedCard } from './referral-link-feed-card'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { EmptyState } from '@/components/shared/empty-state'
import { usePaginatedList, type PaginatedListParams } from '@/hooks/use-paginated-list'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { ReferralLinkFeedResponse } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ReferralLinkFeedListProps {
  data: ReferralLinkFeedResponse
  nextPageEndpoint?: string
  nextPageParams?: PaginatedListParams
  emptyState?: ReactNode
}

const EMPTY_PAGE_PARAMS: PaginatedListParams = {}

export function ReferralLinkFeedList({
  data,
  nextPageEndpoint = '',
  nextPageParams = EMPTY_PAGE_PARAMS,
  emptyState,
}: ReferralLinkFeedListProps) {
  const t = useTranslations()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(data, nextPageEndpoint, nextPageParams)

  const allResults = mergePageResultsById(pages)
  const allUsers = mergeRecords(pages, page => page.users)

  if (allResults.length === 0) {
    if (emptyState !== undefined) return emptyState
    return (
      <EmptyState
        icon='inbox'
        title={t('extracted.feed.referralLinkFeedList.noReferralLinksYet_17b1386e')}
        description={t(
          'extracted.feed.referralLinkFeedList.followFriendsToSeeTheirReferral_3d79100c',
        )}
      />
    )
  }

  const canLoadMore = hasNextPage && Boolean(nextPageEndpoint)

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
        {allResults.map(item => (
          <ReferralLinkFeedCard
            key={item.id}
            item={item}
            user={allUsers[item.user_id]}
          />
        ))}
      </div>
    </InfiniteScroll>
  )
}
