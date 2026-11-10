'use client'

import Link from 'next/link'
import { EmptyState } from '@/components/shared/empty-state'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { topicHref } from '@/lib/links/entity-href'
import { mergePageResultsById } from '@ts-shared/utils/collections'
import type { ListResponse, UserReferralLinkSummary } from '@/types/api-responses'

export function PaginatedUserReferralLinkList({
  initialData,
  userId,
  emptyTitle,
  emptyDescription,
}: {
  initialData: ListResponse<UserReferralLinkSummary>
  userId: string
  emptyTitle: string
  emptyDescription: string
}) {
  const state = usePaginatedList(initialData, '/api/v1/referral-links', { user_id: userId })
  const links = mergePageResultsById(state.pages)
  const handleLoadMore = state.loadMore
  const body =
    links.length === 0 ? (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
      />
    ) : (
      <div className='space-y-4'>
        {links.map(link => (
          <Link
            key={link.id}
            href={topicHref({
              topic_type: 'referral_program',
              id: link.referral_program_id,
              slug: link.referral_program_slug,
            })}
            prefetch={false}
            data-pw='user-referral-link-summary'
            className='block rounded-md border p-4 hover:underline'
          >
            <span className='block font-medium'>{link.referral_program_name}</span>
            <span className='block truncate text-sm text-muted-foreground'>{link.url}</span>
            {link.label ? (
              <span className='block truncate text-sm text-muted-foreground'>{link.label}</span>
            ) : null}
          </Link>
        ))}
      </div>
    )
  if (links.length === 0 && !state.hasNextPage) return body

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
      {body}
    </InfiniteScroll>
  )
}
