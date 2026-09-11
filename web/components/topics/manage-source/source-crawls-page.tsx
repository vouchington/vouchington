'use client'

import Link from 'next/link'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { responseCodeClass } from '@/components/topics/manage-source/crawl-outcome'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { useTranslations } from '@/lib/i18n/use-translations'
import { createTopicPathname } from '@/lib/links/entity-href'
import { mergePageResultsById } from '@ts-shared/utils/collections'
import type { ListResponse } from '@/types/api-responses'
import type { Topic } from '@/types/topics'

export interface SourceCrawlSummary {
  id: string
  response_code: number
  created_at: string
}

interface SourceCrawlsPageProps {
  data: ListResponse<SourceCrawlSummary>
  rssFeedId: string
  topic: Pick<Topic, 'id' | 'slug' | 'topic_type'>
}

export function SourceCrawlsPage({ data, rssFeedId, topic }: SourceCrawlsPageProps) {
  const t = useTranslations()
  const endpoint = `/api/v1/rss-feeds/${encodeURIComponent(rssFeedId)}/crawls`
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(data, endpoint, { limit: 20 })
  const crawls = mergePageResultsById(pages)
  const crawlDetailBase = createTopicPathname(topic, '/crawls/')

  if (crawls.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('extracted.manageSource.crawlHistorySection.noCrawlsYet_12d0f59a')}
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
      <div className='overflow-hidden bg-card shadow-sm dark:shadow-none sm:rounded-lg'>
        <table
          className='w-full text-sm'
          data-pw='source-crawls-table'
        >
          <thead>
            <tr className='border-b text-left text-muted-foreground'>
              <th
                scope='col'
                className='px-6 py-3 font-medium'
              >
                {t('extracted.manageSource.crawlHistorySection.timestamp_115a2cc9')}
              </th>
              <th
                scope='col'
                className='px-6 py-3 font-medium'
              >
                {t('extracted.manageSource.crawlHistorySection.responseCode_c7992dd3')}
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-border'>
            {crawls.map(crawl => (
              <tr
                key={crawl.id}
                className='relative hover:bg-muted/50'
              >
                <td
                  className='px-6 py-4 text-foreground'
                  suppressHydrationWarning
                >
                  <Link
                    href={`${crawlDetailBase}${crawl.id}`}
                    prefetch={false}
                    aria-label={t(
                      'extracted.manageSource.crawlHistorySection.viewCrawlFromDate_73e55b54',
                      { date: new Date(crawl.created_at).toLocaleString() },
                    )}
                    className="after:absolute after:inset-0 after:content-['']"
                    data-pw='source-crawl-row'
                  >
                    {new Date(crawl.created_at).toLocaleString()}
                  </Link>
                </td>
                <td className='px-6 py-4'>
                  <span className={responseCodeClass(crawl.response_code)}>
                    {crawl.response_code}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </InfiniteScroll>
  )
}
