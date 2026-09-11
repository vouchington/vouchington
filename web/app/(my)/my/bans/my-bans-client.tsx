'use client'

import { TimeAgo } from '@/components/shared/time-ago'
import { AppealDialog } from '@/components/appeals/appeal-dialog'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { communityHref } from '@/lib/links/entity-href'
import { listMyBans } from '@/lib/api/client/bans'
import type { MyActiveCommunityBan, MyBansResponse } from '@/types/my'
import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/use-translations'

interface MyBansClientProps {
  initialData: MyBansResponse
}

export function MyBansClient({ initialData }: MyBansClientProps) {
  const t = useTranslations()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(initialData, '/api/v1/my/bans', {}, { loadPage: listMyBans })
  const bans = uniqueBans(pages.flatMap(page => page.bans))

  if (bans.length === 0) {
    return (
      <p
        className='text-sm text-muted-foreground'
        data-pw='my-bans-empty'
      >
        {t('extracted.bans.myBansClient.youHaveNoActiveCommunityBans_058f05ed')}
      </p>
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
      <ul
        className='space-y-4'
        data-pw='my-bans-list'
      >
        {bans.map(ban => (
          <li
            key={ban.id}
            className='rounded-md border bg-card p-4'
            data-pw='my-ban-item'
          >
            <div className='flex flex-wrap items-start justify-between gap-2'>
              <div className='flex flex-col gap-1'>
                {ban.community_slug ? (
                  <p className='text-xs text-muted-foreground'>
                    {t('extracted.bans.myBansClient.community_a497fe96')}{' '}
                    <Link
                      href={communityHref({ slug: ban.community_slug })}
                      className='underline'
                      prefetch={false}
                    >
                      {ban.community_slug}
                    </Link>
                  </p>
                ) : (
                  <p className='text-xs text-muted-foreground'>
                    {t('extracted.bans.myBansClient.communityBan_8ec5b51b')}
                  </p>
                )}
                {ban.expires_at ? (
                  <p
                    className='text-xs text-muted-foreground'
                    data-pw='my-ban-expires'
                  >
                    {t('extracted.bans.myBansClient.expires_8353d67b')}{' '}
                    <TimeAgo date={ban.expires_at} />
                  </p>
                ) : null}
              </div>
              <div className='flex items-center gap-3'>
                <time
                  className='text-xs tabular-nums text-muted-foreground'
                  data-pw='my-ban-date'
                >
                  <TimeAgo date={ban.created_at} />
                </time>
                <AppealDialog communityBanId={ban.id} />
              </div>
            </div>
            {ban.reason ? (
              <p
                className='mt-2 whitespace-pre-wrap break-words text-sm'
                data-pw='my-ban-reason'
              >
                {ban.reason}
              </p>
            ) : (
              <p
                className='mt-2 text-sm text-muted-foreground'
                data-pw='my-ban-no-reason'
              >
                {t('extracted.bans.myBansClient.noReasonWasProvided_56395f77')}
              </p>
            )}
          </li>
        ))}
      </ul>
    </InfiniteScroll>
  )
}

function uniqueBans(bans: MyActiveCommunityBan[]): MyActiveCommunityBan[] {
  return [...new Map(bans.map(ban => [ban.id, ban])).values()]
}
