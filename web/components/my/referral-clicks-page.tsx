'use client'

import Link from 'next/link'
import { TimeAgo } from '@/components/shared/time-ago'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { userHref } from '@/lib/links/entity-href'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { ReferralClickLogResponseBody } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

function truncateUrl(url: string, maxLen = 50): string {
  try {
    const { hostname, pathname } = new URL(url)
    const short = `${hostname}${pathname}`
    return short.length > maxLen ? `${short.slice(0, maxLen)}…` : short
  } catch {
    return url.length > maxLen ? `${url.slice(0, maxLen)}…` : url
  }
}

export function ReferralClicksPage({ initialData }: { initialData: ReferralClickLogResponseBody }) {
  const t = useTranslations()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(initialData, '/api/v1/my/referral-clicks', {})
  const results = mergePageResultsById(pages)
  const clicks = mergeRecords(pages, page => page.clicks)
  const users = mergeRecords(pages, page => page.users)

  return (
    <div className='space-y-4'>
      <div>
        <h1
          className='text-2xl font-bold'
          data-pw='referrals-page-heading'
        >
          {t('extracted.my.referralClicksPage.referrals_76ffc344')}
        </h1>
        <p
          className='text-sm text-muted-foreground'
          data-pw='referrals-page-description'
        >
          {t('extracted.my.referralClicksPage.peopleWhoVisitedYourLandingPage_2e28bd75')}
        </p>
      </div>

      {results.length === 0 ? (
        <p className='rounded-lg border p-6 text-center text-sm text-muted-foreground'>
          {t('extracted.my.referralClicksPage.noReferralClicksYet_a38e7431')}
        </p>
      ) : (
        <InfiniteScroll
          hasNextPage={hasNextPage}
          endCursor={endCursor}
          onLoadMore={loadMore}
          loadingMore={loadingMore}
          fetchError={fetchError}
          clearError={clearError}
          resetKey={resetKey}
        >
          <div className='rounded-lg border'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b bg-muted/50'>
                  <th className='px-4 py-3 text-left font-medium'>
                    {t('extracted.my.referralClicksPage.landingUrl_e50a8a19')}
                  </th>
                  <th className='px-4 py-3 text-left font-medium'>
                    {t('extracted.my.referralClicksPage.date_99c40ab4')}
                  </th>
                  <th className='px-4 py-3 text-left font-medium'>
                    {t('extracted.my.referralClicksPage.signedUp_1b64747b')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map(result => {
                  const click = clicks[result.id]
                  if (!click) return null
                  const user = click.user_id ? users[click.user_id] : null
                  return (
                    <tr
                      key={result.id}
                      className='border-b last:border-b-0'
                    >
                      <td className='px-4 py-3'>
                        {/^https?:\/\//i.test(click.landing_url) ? (
                          <a
                            href={click.landing_url}
                            target='_blank'
                            rel='nofollow noopener noreferrer'
                            className='text-primary hover:underline'
                            title={click.landing_url}
                          >
                            {truncateUrl(click.landing_url)}
                          </a>
                        ) : (
                          <span title={click.landing_url}>{truncateUrl(click.landing_url)}</span>
                        )}
                      </td>
                      <td className='px-4 py-3 text-muted-foreground'>
                        <TimeAgo date={click.created_at} />
                      </td>
                      <td className='px-4 py-3'>
                        {user?.username ? (
                          <Link
                            href={userHref(user)}
                            prefetch={false}
                            className='text-primary hover:underline'
                          >
                            @{user.username}
                          </Link>
                        ) : click.signed_up_at ? (
                          <span className='text-muted-foreground'>
                            {t('extracted.my.referralClicksPage.anonymous_e7a8aa2d')}
                          </span>
                        ) : (
                          <span className='text-muted-foreground'>
                            {t('extracted.my.referralClicksPage.text_bda05058')}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </InfiniteScroll>
      )}
    </div>
  )
}
