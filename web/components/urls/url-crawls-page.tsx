'use client'

import Link from 'next/link'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { createUrlPathname } from '@/lib/links/entity-href'
import { mergePageResultsById } from '@ts-shared/utils/collections'
import type { CrawlListResponseBody } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

const crawlDateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})

interface UrlCrawlsPageProps {
  data: CrawlListResponseBody
  urlId: string
}

export function UrlCrawlsPage({ data, urlId }: UrlCrawlsPageProps) {
  const t = useTranslations()
  const endpoint = `/api/v1/urls/${encodeURIComponent(urlId)}/crawls`
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(data, endpoint, { limit: 20 })

  const results = mergePageResultsById(pages)

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
      <div className='overflow-hidden bg-card shadow-sm dark:shadow-none sm:rounded-lg'>
        <table className='min-w-full divide-y divide-border'>
          <thead className='bg-muted/50'>
            <tr>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.urls.urlCrawlsPage.createdAt_3d443370')}
              </th>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.urls.urlCrawlsPage.statusCode_6bd59553')}
              </th>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.urls.urlCrawlsPage.completed_22a970d2')}
              </th>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.urls.urlCrawlsPage.actions_ff8059dc')}
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-border bg-card'>
            {results.map(crawl => (
              <tr key={crawl.id}>
                <td
                  className='whitespace-nowrap px-6 py-4 text-sm text-foreground'
                  suppressHydrationWarning
                >
                  {crawlDateFormatter.format(new Date(crawl.created_at))}
                </td>
                <td className='whitespace-nowrap px-6 py-4 text-sm text-muted-foreground'>
                  {crawl.response_status_code}
                </td>
                <td className='whitespace-nowrap px-6 py-4 text-sm text-muted-foreground'>
                  {crawl.completed_at ? 'Yes' : 'No'}
                </td>
                <td className='whitespace-nowrap px-6 py-4 text-sm text-muted-foreground'>
                  <Link
                    prefetch={false}
                    href={createUrlPathname(urlId, `/crawls/${crawl.id}`)}
                    className='text-primary hover:text-primary/80'
                  >
                    {t('extracted.urls.urlCrawlsPage.view_dcc839a4')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </InfiniteScroll>
  )
}
