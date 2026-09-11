'use client'

import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { RssFeedCrawlSummary } from '@/types/rss-feeds'

interface CrawlHistorySectionProps {
  crawls: RssFeedCrawlSummary[]
  crawlsHref: string
  crawlDetailHrefBase: string
  newsHref: string
}

export function CrawlHistorySection({
  crawls,
  crawlsHref,
  crawlDetailHrefBase,
  newsHref,
}: CrawlHistorySectionProps) {
  const t = useTranslations()
  return (
    <section
      className='bg-card p-6 shadow-sm dark:shadow-none sm:rounded-lg'
      data-pw='crawl-history-section'
    >
      <h2 className='mb-4 text-xl font-semibold text-foreground'>
        {t('extracted.manageSource.crawlHistorySection.crawlHistory_a878daa5')}
      </h2>
      {crawls.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.manageSource.crawlHistorySection.noCrawlsYet_12d0f59a')}
        </p>
      ) : (
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b text-left text-muted-foreground'>
              <th
                scope='col'
                className='pb-2 font-medium'
              >
                {t('extracted.manageSource.crawlHistorySection.timestamp_115a2cc9')}
              </th>
              <th
                scope='col'
                className='pb-2 font-medium'
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
                  className='py-2 text-foreground'
                  suppressHydrationWarning
                >
                  <Link
                    href={`${crawlDetailHrefBase}${crawl.id}`}
                    prefetch={false}
                    aria-label={t(
                      'extracted.manageSource.crawlHistorySection.viewCrawlFromDate_73e55b54',
                      { date: new Date(crawl.created_at).toLocaleString() },
                    )}
                    className="after:absolute after:inset-0 after:content-['']"
                    suppressHydrationWarning
                  >
                    {new Date(crawl.created_at).toLocaleString()}
                  </Link>
                </td>
                <td className='py-2'>
                  <span className={responseCodeClassName(crawl.response_code)}>
                    {crawl.response_code}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className='mt-4 flex gap-4'>
        <Link
          href={crawlsHref}
          prefetch={false}
          data-pw='crawl-history-view-all-crawls'
          className='text-sm text-primary hover:underline'
        >
          {t('extracted.manageSource.crawlHistorySection.viewAllCrawls_2ee3d00d')}
        </Link>
        <Link
          href={newsHref}
          prefetch={false}
          data-pw='crawl-history-view-ingested-items'
          className='text-sm text-primary hover:underline'
        >
          {t('extracted.manageSource.crawlHistorySection.viewIngestedItems_c52d16e8')}
        </Link>
      </div>
    </section>
  )
}

function responseCodeClassName(responseCode: number): string {
  if (responseCode >= 200 && responseCode < 300) return 'text-emerald-600 dark:text-emerald-400'
  if (responseCode >= 400) return 'text-destructive dark:text-destructive'
  return 'text-yellow-600 dark:text-yellow-400'
}
