'use client'

import Link from 'next/link'
import { ExternalLink } from '@/components/ui/external-link'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList, type PaginatedListParams } from '@/hooks/use-paginated-list'
import { domainHref } from '@/lib/links/entity-href'
import { mergePageResultsById } from '@ts-shared/utils/collections'
import type { UrlListResponseBody } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

interface UrlListPageProps {
  data: UrlListResponseBody
  nextPageParams: PaginatedListParams
}

export function UrlListPage({ data, nextPageParams }: UrlListPageProps) {
  const t = useTranslations()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(data, '/api/v1/urls', nextPageParams)

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
                {t('extracted.urls.urlListPage.url_e7a241de')}
              </th>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.urls.urlListPage.hostname_2db53355')}
              </th>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.urls.urlListPage.actions_ff8059dc')}
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-border bg-card'>
            {results.map(url => (
              <tr key={url.id}>
                <td className='px-6 py-4 text-sm text-foreground'>
                  <ExternalLink
                    href={url.url}
                    className='text-primary hover:text-primary/80'
                  >
                    {url.url}
                  </ExternalLink>
                </td>
                <td className='whitespace-nowrap px-6 py-4 text-sm text-muted-foreground'>
                  {url.hostname ? (
                    <Link
                      href={domainHref(url.hostname)}
                      prefetch={false}
                      className='text-primary hover:text-primary/80'
                      data-pw='url-hostname-link'
                    >
                      {url.hostname.hostname}
                    </Link>
                  ) : null}
                </td>
                <td className='whitespace-nowrap px-6 py-4 text-sm text-muted-foreground'>
                  <ExternalLink
                    href={url.url}
                    className='text-primary hover:text-primary/80'
                  >
                    {t('extracted.urls.urlListPage.view_dcc839a4')}
                  </ExternalLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </InfiniteScroll>
  )
}
